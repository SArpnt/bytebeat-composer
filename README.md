# bytebeat-composer
Bytebeat player with playlist that contains many interesting formulas from the Internet.

Forked from StephanShi to fix some bugs and soon add new features

afaik this is the only bytebeat program that doesn't have any bugs (the two common ones are being unable to access functions like `escape` or editing strings like `"sin"`)  
this program also works well with storing persistent ariables, in this example `b` is used to store persistent variables
```js
typeof b=='object'||(b={l:0,m:0}),
t=(((t/4e2)%1>.5)+1.5)*64-b.l,b.l+=(b.m+=t*(sin(t/6e3)+1)/200)+t*.03
```
all single letter variables are deleted when the bytebeat is input, so variables between bytebeats don't conflict

i plan on adding an improved scope, time skipping, and many other quality of life features