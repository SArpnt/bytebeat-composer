# bytebeat-composer
Bytebeat player with playlists that contains many interesting formulas from the internet.

Forked from StephanShi to fix bugs and add features

afaik this was the first bytebeat program that didn't have any bugs (the two common ones are being unable to access functions like `escape`, and editing strings like `"sin"`)  
this program also works well with storing persistent variables, in this example `b` is used to store persistent variables
```js
this.b??={a:0,b:0}, // this, window, and globalThis are all the same in this context
w=((t/(+"8654"[t>>11&3]+(t>>15&1))/10%1>.5)+1.5)*64,
c=sin(t/2e3)/6+.3,
b.b+=c*((b.a+=c*(w-b.a+(b.a-b.b)/.7))-b.b)
```
all iterable and single letter variables are deleted when the bytebeat is input, so most variables between bytebeats don't conflict

Longline Theory and Information Theory are played correctly since a signed bytebeat mode has been added

Syntax highlighting has been added, with a good amount of useful settings but nothing intrusive

## Warning

The only security measure in place is only running the function in an AudioWorklet, on the global scope.
As far as i can tell, this should be mostly secure, but this doesn't prevent:
- taking advantage of browser security vulnerabilities
- sending data to other webpages (not sure about this, XMLHttpRequest isn't avalible, but i don't know if there are other ways)
- locking up the audio thread, making controls not work (volume still works, and the page can be refreshed)
- anything else an AudioWorklet could do that i don't know about (i know barely anything about security)
on a secure browser the website _should_ be safe, but i can't guarantee anything.
If i've messed up anywhere then results could be much worse
