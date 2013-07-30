/*global $, timbre, d3, sc, AudioSort, Midi */
(function (global) {
	'use strict';
	global.AudioPlayer = {};
	global.AudioPlayer.create = function (containerSelector, options) {
		var player = {},
			// Config Values
			canvasBackground = '#f3f3f3',
			// State Variables
			isLooping, isPlaying, isReverse,
			intervalIndex, hasMarkers, allowHover, allowClick, onClick,
			// Cached jQuery items
			$container, $svg, $slider,
			$compareCurrent, $compareMax,
			$swapCurrent, $swapMax,
			$positionCurrent, $positionMax,
			// Cached d3 items
			svg,
			// Data
			data, interval, env, waveGenerator, visualization, selectedVisualization = 'bar',
			// Functions
			_init, drawSvg, ensureIntervalIndex, intervalCallback,
			getMidiNumber, getMidiNumberHelper,
			refreshSliderPosition,
			// Event Listeners
			onPlayerButtonClick,
			onPlayerButtonClickCallback,
			onSliderPositionChange
			;

		_init = function () {
			options = options || {};

			// setup some more variables
			isLooping = options.isLooping || false;
			isPlaying = options.isPlaying || false;
			isReverse = options.isReverse || false;
			hasMarkers = options.hasMarkers || false;
			allowHover = options.allowHover || false;
			allowClick = options.allowClick || false;
			onClick = options.onClick;
			if (typeof onClick !== 'function') {
				onClick = $.noop;
			}
			intervalIndex = 0;
			$container = $(containerSelector || null);
			$compareCurrent = $container.find('.compare-current');
			$compareMax = $container.find('.compare-max');
			$swapCurrent = $container.find('.swap-current');
			$swapMax = $container.find('.swap-max');
			$positionCurrent = $container.find('.position-current');
			$positionMax = $container.find('.position-max');
			$svg = $container.find('svg');
			svg = d3.select('#' + $svg.attr('id'));
			onPlayerButtonClickCallback = options.onPlayerButtonClickCallback || null;

			// setup audio envelopes/generators and interval
			player.refreshWaveGenerator();
			interval = timbre('interval', { interval: AudioSort.getTempoString() }, intervalCallback);

			// listen for player button clicks
			$container.find('.player-buttons').on('click', '.btn', onPlayerButtonClick);

			// handle hovers
			if (allowHover) {
				$svg.on('mousemove', function (e) {
					if (visualization.onMouseMove) {
						visualization.onMouseMove(e);
					}
				});
				$svg.on('mouseout', function (e) {
					if (visualization.onMouseOut) {
						visualization.onMouseOut(e);
					}
				});
			}

			// handle clicks
			if (allowClick) {
				$svg.on('mousedown', function (e) {
					if (visualization.onMouseDown) {
						visualization.onMouseDown(e);
					}
				});
				$('body').on('mouseup', function (e) {
					if (visualization.onMouseUp) {
						visualization.onMouseUp(e);
					}
				});
			}

		};

		drawSvg = function () {
			var info, len = data.length, last = len - 1;

			// make sure we have a valid index
			ensureIntervalIndex();

			// draw our visualization
			info = visualization.draw(intervalIndex);

			if (info) {
				// compare: current
				if ($compareCurrent.length) {
					$compareCurrent.text(info.compareCount);
				}
				// compare: max
				if ($compareMax.length) {
					$compareMax.text(last > 0 ? data[last].compareCount : 0);
				}
				// swap: current
				if ($swapCurrent.length) {
					$swapCurrent.text(info.swapCount);
				}
				// swap: max
				if ($swapMax.length) {
					$swapMax.text(last > 0 ? data[last].swapCount : 0);
				}
				// position: current
				if ($positionCurrent.length) {
					$positionCurrent.text(intervalIndex + 1);
				}
				// position: max
				if ($positionMax.length) {
					$positionMax.text(len);
				}
			}
		};

		refreshSliderPosition = function () {
			if ($slider.length) {
				$slider.slider('setValue', intervalIndex);
			}
		};

		ensureIntervalIndex = function () {
			// ensure current index is safe
			intervalIndex = Math.min(intervalIndex, data.length - 1);
			intervalIndex = Math.max(intervalIndex, 0);
		};

		getMidiNumber = function (playValue) {
			var scale, octaveSize, degrees, degreeSize, centerValue, playMidi, centerMidi;

			// get some info from our current scale
			scale = sc.ScaleInfo.at(AudioSort.getSelected('scale'));
			octaveSize = scale.pitchesPerOctave();
			degrees = scale.degrees();
			degreeSize = degrees.length;
			centerValue = Math.floor(AudioSort.getSelected('dataSize') / 2);

			playMidi = getMidiNumberHelper(degrees, degreeSize, octaveSize, playValue);
			centerMidi = getMidiNumberHelper(degrees, degreeSize, octaveSize, centerValue);

			return playMidi + AudioSort.getSelected('centerNote') - centerMidi;
		};

		getMidiNumberHelper = function (degrees, degreeSize, octaveSize, position) {
			return degrees[position % degreeSize] + (Math.floor(position / degreeSize) * octaveSize);
		};

		intervalCallback = function () {
			var midi, info, i, currentItem;
			if (isPlaying) {
				ensureIntervalIndex();
				refreshSliderPosition();

				// play if possible
				if (data.length > 0) {
					info = data[intervalIndex];
					for (i = 0; i < info.arr.length; i++) {
						currentItem = info.arr[i];
						if (currentItem.play) {
							midi = getMidiNumber(currentItem.value);
							if (midi >= 0 && midi < 128) {
								waveGenerator.noteOn(midi, 64);
							}
						}
					}
					drawSvg();
				}

				// we can advance now
				intervalIndex = isReverse ? intervalIndex - 1 : intervalIndex + 1;

				// we can stop if we are not looping
				if (!isLooping && (intervalIndex < 0 || intervalIndex >= data.length)) {
					player.stop();
				}

				// we need to loop
				if (isLooping && intervalIndex < 0) {
					intervalIndex = data.length - 1;
				} else if (isLooping && intervalIndex >= data.length) {
					intervalIndex = 0;
				}

			} else {
				player.stop();
			}
		};

		onPlayerButtonClick = function () {
			var $item = $(this),
				action = $item.data('action');
			if (action === 'stop') {
				player.stop();
			} else if (action === 'play') {
				player.play();
			} else if (action === 'reverse') {
				player.play(true);
			} else if (action === 'goToFirst') {
				player.goToFirst();
			} else if (action === 'goToLast') {
				player.goToLast();
			} else if (action === 'loop') {
				isLooping = !$item.hasClass('active');
				if (isLooping) {
					$item.addClass('active');
				} else {
					$item.removeClass('active');
				}
			}
			refreshSliderPosition();
			if (typeof onPlayerButtonClickCallback === 'function') {
				onPlayerButtonClickCallback({
					item: $item,
					action: action
				});
			}
		};

		onSliderPositionChange = function (e) {
			intervalIndex = parseInt(e.value, 10);
			ensureIntervalIndex();
			drawSvg();
		};

		player.setData = function (d) {
			var selector = containerSelector + ' .position-container';
			data = d;
			$slider = AudioSort.createSlider(selector, {
				value: 0,
				min: 0,
				max: data.length - 1,
				step: 1
			}, onSliderPositionChange);
			player.setVisualization(selectedVisualization, true);
		};

		player.setVisualization = function (visualizationName, forceInit) {
			var shouldInit = false;
			if (global.visualization.hasOwnProperty(visualizationName) && selectedVisualization !== visualizationName) {
				selectedVisualization = visualizationName;
				shouldInit = true;
			}
			if (shouldInit) {
				$svg.empty();
			}
			if (shouldInit || forceInit) {
				visualization = global.visualization[selectedVisualization]({
					data: data,
					svg: svg,
					$svg: $svg,
					hasMarkers: hasMarkers,
					onClick: onClick
				});
				drawSvg();
			}
		};

		player.setTempo = function (tempo) {
			interval.set({interval: tempo});
		};

		player.setVolume = function (volume) {
			waveGenerator.set({mul: volume});
		};

		player.play = function (reverse) {
			interval.stop();
			isPlaying = true;
			if (reverse === true) {
				isReverse = true;
				if (intervalIndex <= 0) {
					intervalIndex = data.length - 1;
				}
			} else {
				isReverse = false;
				if (intervalIndex >= data.length - 1) {
					intervalIndex = 0;
				}
			}
			isReverse = reverse === true ? true : false;
			waveGenerator.play();
			interval.start();
		};

		player.stop = function () {
			isPlaying = false;
			interval.stop();
		};

		player.isPlaying = function () {
			return isPlaying;
		};

		player.goToFirst = function () {
			intervalIndex = 0;
			ensureIntervalIndex();
			drawSvg();
		};

		player.goToLast = function () {
			intervalIndex = data.length - 1;
			ensureIntervalIndex();
			drawSvg();
		};

		player.getMidiBytes = function () {
			var i, j,
				midiFile, midiTrack,
				channel = 0, duration = 64,
				info, currentItem, midiNumber, play;

			// setup midi file
			midiFile = new Midi.File();
			midiTrack = new Midi.Track();
			midiTrack.setTempo(AudioSort.getSelected('tempo'));
			midiFile.addTrack(midiTrack);

			// build midi track
			for (i = 0; i < data.length; i++) {
				info = data[i];
				play = [];
				// get the notes we need to play
				for (j = 0; j < info.arr.length; j++) {
					currentItem = info.arr[j];
					if (currentItem.play) {
						midiNumber = getMidiNumber(currentItem.value);
						if (midiNumber >= 0 && midiNumber < 128) {
							play.push(midiNumber);
						}
					}
				}
				// note on
				for (j = 0; j < play.length; j++) {
					if (j === 0) {
						midiTrack.noteOn(channel, play[j], duration);
					} else {
						midiTrack.noteOn(channel, play[j]);
					}
				}
				// note off
				for (j = 0; j < play.length; j++) {
					midiTrack.noteOff(channel, play[j]);
				}
			}

			return midiFile.toBytes();
		};

		player.refreshWaveGenerator = function () {
			var waveInfo = AudioSort.getSelectedWaveformInfo();
			$.each([env, waveGenerator], function (index, obj) {
				$.each(['pause', 'removeAllListeners'], function (index, key) {
					if (obj && typeof obj[key] === 'function') {
						obj[key]();
					}
				});
			});
			env = timbre('adshr', {
				a: waveInfo.a,
				d: waveInfo.d,
				s: waveInfo.s,
				h: waveInfo.h,
				r: waveInfo.r
			});
			waveGenerator = timbre(waveInfo.gen, {
				env: env,
				mul: AudioSort.getSelected('volume') * waveInfo.mul,
				poly: waveInfo.poly || 10
			}).on('ended', function () {
				if (!isPlaying) {
					this.pause();
				}
			});
			if (waveInfo.gen === 'OscGen') {
				waveGenerator.set('osc', timbre(AudioSort.getSelected('waveform')));
			}
			if (isPlaying) {
				waveGenerator.play();
			}
		};

		player.drawEnvelopeCanvas = function () {
			// ADSHR
			if (env && typeof env.plot === 'function') {
				env.plot({
					target: $('#waveform-adshr-canvas').get(0),
					background: canvasBackground
				});
			}
		};

		player.drawWaveformCanvases = function () {
			var canvas, context;
			// ADSHR
			player.drawEnvelopeCanvas();
			// Waveform
			canvas = $('#waveform-canvas').get(0);
			if (waveGenerator && waveGenerator.osc) {
				waveGenerator.osc.plot({
					target: canvas,
					background: canvasBackground
				});
			} else {
				context = canvas.getContext('2d');
				context.clearRect(0, 0, context.canvas.width, context.canvas.height);
			}
		};

		// initialize player
		_init();

		return player;
	};
}(this));