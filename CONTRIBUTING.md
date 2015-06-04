# Coding style

> All code in any code-base should look like a single person typed it, no matter how many people contributed.

This section describes coding style guide of the repo. You might not agree with it and that's fine but if you're going to send PRs treat this guide as a law.

This module uses latest _ECMAScript_ features with the help of [Babel transpiler](http://babeljs.io/).

##### There are not too much of rules to follow:

- indent style is 4 spaces
- always use single quotes 
- one space after `if`, `for`, `while`, etc.
- no spaces between `(`,`)` and statement content
- use one `let`/`const` per variable unless you don't assign any values to it (and it's short enough)
- always use strict comparisons: `===` and `!==`
- use semicolons
- don't use comma-first notation

##### These tools will help your IDE to remind you with some of the rules listed above:

- [EditorConfig](http://editorconfig.org)
- [ESLint](http://eslint.org)
