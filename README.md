# bytebeat-composer
Bytebeat player with playlists that contains many interesting formulas from the internet.

Forked from StephanShi to fix bugs and add features

afaik this was the first bytebeat program that didn't have any bugs (the two common ones are being unable to access functions like `escape` or editing strings like `"sin"`)  
this program also works well with storing persistent variables, in this example `b` is used to store persistent variables
```js
this.b??={l:0,m:0}), // this, window, and globalThis are all the same in this context
t=(((t/4e2)%1>.5)+1.5)*64-b.l,b.l+=(b.m+=t*(sin(t/6e3)+1)/200)+t*.03
```
all iterable and single letter variables are deleted when the bytebeat is input, so those variables between bytebeats don't conflict

Longline Theory and Information Theory are played correctly since a signed bytebeat mode has been added

## Warning

The only security measure in place is only running the function in an AudioWorklet, on the global scope.
As far as i can tell, this should be mostly secure, but this doesn't prevent:
- taking advantage of browser security vulnerabilities
- sending data to other webpages (not sure about this, XMLHttpRequest isn't avalible, but i don't know if there are other ways)
- locking up the audio thread, making controls not work (volume still works, and the page can be refreshed)
- anything else an AudioWorklet could do that i don't know about (i know barely anything about security)
on a secure browser the website _should_ be safe, but i can't guarantee anything.
