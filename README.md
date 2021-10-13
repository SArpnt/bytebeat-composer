# bytebeat-composer
Bytebeat player with playlist that contains many interesting formulas from the Internet.

Forked from StephanShi to fix some bugs and soon add new features

afaik this is the only bytebeat program that doesn't have any bugs (the two common ones are being unable to access functions like `escape` or editing strings like `"sin"`)  
this program also works well with storing persistent variables, in this example `b` is used to store persistent variables
```js
typeof b=='object'||(b={l:0,m:0}),
t=(((t/4e2)%1>.5)+1.5)*64-b.l,b.l+=(b.m+=t*(sin(t/6e3)+1)/200)+t*.03
```
all single letter variables are deleted when the bytebeat is input, so variables between bytebeats don't conflict

Longline Theory and Information Theory are played correctly since a signed bytebeat mode has been added

i plan on improving performance and adding many helpful features for developing and playing

## Warning

There is absolutely no security features whatoever on the site, any code can be ran.
I wouldn't reccomend using links to this website on an insecure browser because there's nothing stopping someone from:
- redirecting to other websites
- changing the webpage, including in ways that affect the next bytebeats being ran
- taking advantage of browser security vulnerabilities
- sending data to other webpages
- downloading files and other things that can only be done on user input (i will try to prevent this at some point)
- causing extreme lag
- taking advantage of cookies and localstorage (i will try to prevent this at some point)
on a secure browser the website _should_ be safe, but i can't guaruntee anything.