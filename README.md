# bytebeat-composer
modern bytebeat player with a library of many formulas from around the internet.

originally forked from [StephanShi's website](https://github.com/SthephanShinkufag/bytebeat-composer) to fix bugs and add features, now maintained independently with different codebases.

afaik this was the first bytebeat program that didn't have any major playback bugs (the two common ones are being unable to access functions like `escape`, and editing strings like `"sin"`)  
this program also works well with storing persistent variables, in this example `b` is used to store persistent variables
```js
this.b??={a:0,b:0}, // this, window, and globalThis are all the same in this context
w=((t/(+"8654"[t>>11&3]+(t>>15&1))/10%1>.5)+1.5)*64,
c=sin(t/2e3)/6+.3,
b.b+=c*((b.a+=c*(w-b.a+(b.a-b.b)/.7))-b.b)
```
all iterable variables are deleted when the bytebeat is input, so variables between bytebeats don't conflict

Longline Theory and Information Theory are played correctly since a signed bytebeat mode has been added

syntax highlighting has been added, with a good amount of useful settings but nothing intrusive

stereo is supported by returning an array

## warning

this website runs arbitrary code!

i've taken many security measures, but i can't guarantee what i've done is foolproof.
as far as i can tell, this website should be secure, but this doesn't prevent:
- taking advantage of browser security vulnerabilities
- locking up the audio thread, making controls not work (volume still works, and the page can be refreshed)
- anything else an AudioWorklet could do that i don't know about (i really don't know that much about security)

on a secure browser the website _should_ be safe, but i can't guarantee anything.
If i've messed up anywhere then results could be much worse

to judge yourself, these are the security measures i've taken:
- input code is ran in an audio worklet (note that the code has access to the global scope)
- most iterable global variables are deleted
- objects and prototypes of objects on the global scope are frozen
- variables remaining on the global scope are made unwritable and unconfigurable 

## embedding

https://sarpnt.github.io/bytebeat-composer/embeddable.html is an embeddable version of the page, designed to be used in other projects.
it doesn't have the library, doesn't save settings, and can recieve commands via `postMessage`

command format:
```js
{
	show: { // show / hide webpage elements
		codeEditor: boolean,
		timeControls: boolean, // also prevents clicking the canvas to start/stop song
		playbackControls: boolean,
		viewControls: boolean,
		songControls: boolean,
		error: boolean,
		scope: boolean,
	},
	forceScopeWidth: number?, // force the scope width, non-numbers set back to auto
	getSong: boolean, // song will be sent to parent page in the format
	setSong: {
		code: string,
		sampleRate: number, // default 8000
		mode: string, // default "Bytebeat"
		// changes will be made later so that any settings that don't exist here won't be changed
	},
	// commands to control playback aren't implemented yet
}
```

any messages recieved will be in this format:
```js
{
	song: { // sent on getSong
		code: string,
		sampleRate: number,
		mode: string,
	},
}
```

## dead links

if any previously working links stop working, LET ME KNOW. link compatibility is supposed to stay permenantly.  
if i'm unavalible or you're in a hurry, you can decode the links manually:

- links prefixed with `#v3b64` are the oldest, to decode:
	1. remove the prefix
	2. convert from base 64 with atob
	3. (if using pako) get the codepoint of each character and place in a Uint8Array
	4. inflateRaw to string with zlib or pako (not sure quite how zlib works in this case, pako is preferable)
	5. parse with JSON
- links prefixed with `#v4` have essentially the same process. the only differences are the prefix and the absence of base64 padding.
