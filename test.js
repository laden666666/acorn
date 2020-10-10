// const {parse} = require('./acorn/src');
const {parse} = require('./acorn-loose/dist/acorn-loose');

console.log(JSON.stringify(parse(`var a = 1;
var 
var c = 3;`, {}), null, 4));
