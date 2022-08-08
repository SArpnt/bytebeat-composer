# bytebeat info

## ui

top is the code area which shouldn't need explaining

orange bordered view is the oscillioscope, it graphs the sound output over time, with sound output being a number that turns into speaker movement / air pressure.\
for example lower values could move the speaker inward while higher values move outward (could also be vice versa depending on speaker wiring but it sounds the same)

left to right on the settings bar is:

- time, click button to change unit (t is samples and matches t variable)
- playback controls
- oscillioscope zoom
- oscillioscope draw mode
- playback mode (read info section on webpage for explanations)
- sample rate (samples per second, higher values give higher quality audio to an extent, higher than 48000 is unneccecary)
- sample rate divisor (skips samples for performance, could affect playback quite a bit if static variables are used)
- volume

sample rate and playback mode are part of the song itself, others are user preference

note that time skipping, reversing, and sample rates higher than 48000 can cause inaccurate audio for some songs due to some bugs currently in the audio system, this is being worked on.

## create a bytebeat

bytebeat does no hand holding when it comes to creating sound, to be able to create something specific requires knowing how sound works

this section is intended for beginners and teaches the relevant parts of js programming and audio synthesis

i use the words code and expression interchangably here, they mean the same thing

### first sounds

start with playback mode Bytebeat, sample rate 8000, and this code:

```js
t
```
you should get a low pitch sawtooth wave (sawtooth being the diagonal spike shape on the oscillioscope, note that one side is diagonal and the other vertical)

the letter `t` here represents the time variable, this code is just outputting the time.
what you would expect from this normally is that it would be just always increasing, so a diagonal line up, but here it keeps dropping to the bottom too.
the reason for the downward jumps is that bytebeat wraps around at the top and bottom, so when it hits 255 the next higher value is 0
think of it like how the time on a clock goes back down to 0

you can remove `t` and just type numbers directly like `60`, note that no numbers create any sound and the only sounds are from changing numbers
this is because we only hear changes in air pressure, not air pressure directly

```js
t/8
```

this is just time divided by 8, note that you can only really hear the click when the value wraps

if you decrease the divisor, it speeds up and around 2 or 1 it starts to get a low pitch, but you can still hear the individual clicks
this is the point where it gets into human hearing range, and there's an important thing to note from this: pitch and rhythm are the same thing

```js
t*2
```

by multiplying t by larger numbers you can get higher pitches.
note that at high values like 34 the wrapping doesn't quite line up anymore and you can both see and hear issues, this is caused by aliasing.
if you go extremely high multiples like 255 the pitch goes down again because it wraps mostly back to where it was before, at 256 it wraps all the way back to the start.


```js
t*t/300
```

last to look at here is just increasing pitch, note that after the pitch gets high enough the pitch starts dropping again due to aliasing.


at this point you may want to read up on [javascript operators](https://www.w3schools.com/jsref/jsref_operators.asp).
important here currently are arithmetic operators, comparison operators, and logical operators.
you may want to also check operator precedence to get an idea of when parenthesis are needed or not

### volume and better pitch control

we hear changes in value, so quieter sounds can be done with smaller changes.
to do this we could divide the output by 2, but there's a problem: that just changes the pitch, because the point it wraps doesn't change.
the wrapping in bytebeat is often useful in simple expressions but we need our own wrapping to get somewhere now, this can be done with the remainder operator.

```js
t%128
```

here the wrapping point is much lower and every value is in the range 0-127 (not 128!).
note that negative numbers will wrap in the negatives which can be inconvenient.

because the wrapping point has changed this has also changed the pitch, if you want independent control of pitch and volume a setup like this can be used:

```js
t*3%256/3
```

replace either 3 for different results.

if it helps you can think of this like function transformation from mathematics, where the function here is the wrapping.

if you aren't familiar or have trouble with functions, one way you can think of it is just the waveform itself doesn't have any particular speed or pitch,
but you can scrub through it like scratching a turntable (you probably havent ever handled vinyl records but bear with me here),
records and cassetes and such only play when being turned or scrubbed through,
and doing it faster or slower changes the pitch and speed (both are essentially the same thing) of the recording.
the way these waveforms work is that they don't really have a correct speed, you can just choose when and where to scrub through them.

best website to try and demonstrate what im talking about is probably [mix.until.am](http://mix.until.am), i might make something myself at some point for a better demonstration.

### quick clarification on terminology

there's a lot of words coming up that will be very important, and some that might not be clear yet.

#### javascript

this is the programming language that is used to program bytebeats.
the way it's being taught here isn't how you would normally learn it but it makes things easier.
you'll likely want to learn javascript properly for more skills, things such as array methods, string methods, and typecasting can be very useful.

#### waveform

waveforms are (to simplify) what controls the timbre of a sound,
these are shown as the shape on the oscillioscope view.
note that changing volume and pitch don't change the waveform in a meaningful way, but changing it constantly does (hint for later).

for example, sawtooth is the waveform we've been using so far, with the diagonal spikes.

#### oscillioscope

the thing on the website with the line that shows the sound.
a technical explanation isn't too important here

#### sample

a sample is a value returned from the expression, you can see it as each fully white dot on the oscillioscope.
note that lower and higher sample rates don't just change the song speed, they change the quality of the audio too.
lower sample rates have more aliasing, for example `t*9*4` at 4000 hz sounds awful while `t*9` at 16000 hz sounds much better.

### phase

phase is the time position of a sound.

to use the vinyl analogy from before, phase is just where you are in the song, while pitch/speed is the rate that phase changes.

you can use a physics analogy, phase is like displacement while pitch/speed is like velocity (this physics analogy will be useful later, hint #2, wink nudge and other various attention grabbing actions)

### waveforms

#### sawtooth

```js
t%128
```

this is here for comparison, we already know this one.

#### square

```js
(t%128>64)*128
```

for many of these waveforms we take advantage of what sawtooth actually does, it's a simple increasing value that resets.
for a square wave we can just get when it gets halfway up, and set the value accordingly.

note that the greater than comparison doesn't return a number, it returns `true` or `false`, which essentially mean yes and no.
this is called a boolean.
here we take advantage of javascripts type leniancy, when we do math on `true` and `false` it becomes `1` and `0`, which in this case makes an extremely quiet square wave.

#### pulse

```js
(t%128>64)*128
```

same as a square wave, but asymmetrical. `64` can be replaced with any value to control the pulse width.

square waves are a type of pulse wave, just like squares are a type of rectangle.

#### triangle

```js
abs(128-t*2%256)
```

this is the first code so far to have a function, we'll learn more about them later, but to clarify here

triangle waves sound much quieter, note that they don't have any sharp changes like sawtooth or pulse waves.

triangle waves actually sound more like square waves than sawtooth waves, because they have the same overtones.
overtones are a somewhat complex topic that will be saved for later.

#### sine

```js
sin(t*PI/32)*64+64
```

it might seem weird to have a trigonometric function here, but sine waves are actually pretty important when it comes to audio.
this is because sine waves have no overtones.

these have the softest sound possible, again because there are no overtones.

note that `PI` has to be used here because the `sin` function uses radians.
`sin` also gives an output of -1 - 1, so it may need to be shifted up to prevent it from wrapping around the bottom.

#### white noise

```js
random()*128
```

this isn't really a waveform, but is pretty important.
for the example here we just generate random numbers, but anything that sounds random will work fine.
note that the random function will generate a random number from 0 - 1, not including 1.

there are also other variations of noise that are used less often, but they can be dealt with later.

### sequencing

sequencing means setting up things like volumes and pitches at specific times, this is when it moves away from just being sounds to actual music.

the way we'll do this for now is an array. which is just the term for an ordered list in javascript.

```js
[0, 1, 2, 3, 4]
```

an array is written like this, note that the first item is item 0, not item 1. this might seem strange but it makes most math much simpler.

```js
[2,4,3,4][int(t/800)%4]
```

on the left is the array, on the right is the expression to index the array, which means to grab the value at a specific position.
the `int` function here just rounds the number down.

item 0 is already making things easier, if the list started at 1, we would need to awkwardly add 1 to the index.

here's a somewhat simple sequenced tune:

```js
t*3.5/
[
	[7,14,6,12,5,10,4,8],
	[7.5,15,7,14,6,12,4.45,8.9],
][int(t/32000)%2][int(t/1000)%8]
%32*[7,5,8,6][int(t/1000)%4]
```

yes, those are arrays inside an array.
the first index (`int(t/32000)%2`) indexes the outer array to get one of the inner arrays,
then the second index (`int(t/1000)%8`) gets a number from that inner array.

the second array indexing pair controls volume.

### multiple instruments

just add them and make sure not to accidentally wrap around

```js
t%64+
t*2%64+
t*3.001%64+
t*4.01%64
```

note that if multiple instruments are exactly in sync it will often just sound like one.
this is especially the case if the higher pitched instruments are quieter.

```js
t%64+
t%32
```

the only thing that seperates different instruments is context.

at this point you should have everything you need to make simple tunes, but there's plenty more interesting things to learn.

### modulation and complex synthesis

let's redeem that hint from earlier with modulation.

```js
(t*2+sin(t/300)*4)%128
```

here we're modulating the phase of the sawtooth with a sine wave.
increasing the volume of the sine wave increases the vibrato and increasing the pitch of the sine wave makes it faster.

something to note here is that the pitch of the sine wave is so low you can't even hear it, it's just rhythm.

something you might be wondering is why we're changing the phase and not the pitch, this is for two reasons:

1. changing the phase changes the pitch

	pitch is just change of phase, so every part of the sin wave with a steep slope is an increase or decrease in pitch

2. trying to change the pitch doesn't even work

	```js
	(t*2*(1+sin(t/300)/64))%128
	```

	reset the time to 0 and listen to this formula, the vibrato just keeps getting stronger as time goes on.
	this is because trying to change the pitch like this does change the speed, but it doesn't keep the phase.

	to change the pitch correctly here we would need to either store the phase (annoying and can cause various issues),
	or use an infinite series of terms to manage rate of change of pitch, rate of change of rate of change of pitch, and so on (literally impossible) (hint #2 again).

just modulate the phase, not only does it work but it allows doing more than modulating pitch can.

anyways, if you remember from before that the sine wave is an incredibly low pitch, what happens if we increase the pitch?

```js
(t*2+sin(t*PI/128)*50)%128
```

we get a new waveform. this is called pm synthesis or sometimes (and in some cases incorrectly) fm synthesis.
pm is short for phase modulation, fm is short for frequency modulation, and yes that's exactly what that means on a radio.

some terminology: here the sine wave is the modulator, and the sawtooth wave is the carrier.

we can use any volume for the modulator here. any pitch is possible but values close to simple ratios generally sound better.

when the values aren't quite simple ratios the carrier and modulator will drift out of sync

```js
sin(t*PI/64+sin(t*PI/64.2)*7)*64+64
```

fm synthesis works very well with sine waves.

we can also do things like modulate the volume of the modulator.

```js
sin(t*PI/64+sin(t*PI/64)*sin(t/8000)*8)*64+64
```

speaking of volume, let's go back for a second.

tremolo:

```js
((t*2%128-64)*(1+sin(t/300)/4)+128)
```

am synthesis (amplitude modulation, amplitude just being a more technical term for volume/strength)

```js
((t*2%128-64)*(1+sin(t*PI/64)*3)+128)
```

rm synthesis (ring modulation)

```js
((t*2%128-64)*(sin(t*PI/64)*2)+128)
```

note that with ring modulation the volume goes negative, here's an example with a slower modulator to make it clearer:

```js
((t*2%128-64)*(sin(t/300))+128)
```

last kind of modulation is pwm (pulse width modulation)

```js
(t%128 > 64+sin(t/5000)*30)*128
```

doing this one faster usually isn't very interesting.

anyways stack as many as you like, you can put multiple modulators on one carrier, nest, etc.

```js
(
	sin(t*PI/64 * 3 +
		sin(t*PI/64.1 +
			sin(t*PI/16) * sin(t/3000) +
			sin(t*PI/64) * sin(t/30000) * 4
		) * sin(t/80000) * 4
	)
)*64+64
```

# stop here everything below this line is incomplete garbage and notes ============================

sync with sawtooth fm

inverted sawtooth pulse


wrapping with & operator always wraps in positive range and truncates,
however note that it can only wrap for powers of 2, and operator precedence is different.
this can save on characters in many situations.



arrays, strings, charCodeAt, fromCharCode

variables, comma operator

arrow functions

## unfinished stuff

### time forces

it's often useful to use physics equations for phase to manage pitch shifting

d = cycles (phase)
v = cycles / s (Hz)
a = cycles / s**2 (rate of change of Hz)

this allows pitch shifting without messing up phase (which often messes up the pitch shifting in the first place)

this is useful for things such as a kick drum or record stop:

```js
sin((t+60)**.07*400)
```