// This object will hold all exports.
var Haste = {};

/* Thunk
   Creates a thunk representing the given closure.
   Since we want automatic memoization of as many expressions as possible, we
   use a JS object as a sort of tagged pointer, where the member x denotes the
   object actually pointed to. If a "pointer" points to a thunk, it has a
   member 't' which is set to true; if it points to a value, be it a function,
   a value of an algebraic type of a primitive value, it has no member 't'.
*/

function T(f) {
    this.f = new F(f);
}

function F(f) {
    this.f = f;
}

/* Apply
   Applies the function f to the arguments args. If the application is under-
   saturated, a closure is returned, awaiting further arguments. If it is over-
   saturated, the function is fully applied, and the result (assumed to be a
   function) is then applied to the remaining arguments.
*/
function A(f, args) {
    if(f instanceof T) {
        f = E(f);
    }
    // Closure does some funny stuff with functions that occasionally
    // results in non-functions getting applied, so we have to deal with
    // it.
    if(!(f instanceof Function)) {
        return f;
    }

    if(f.arity === undefined) {
        f.arity = f.length;
    }
    if(args.length === f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return f(args[0]);
            default: return f.apply(null, args);
        }
    } else if(args.length > f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return A(f(args.shift()), args);
            default: return A(f.apply(null, args.splice(0, f.arity)), args);
        }
    } else {
        var g = function() {
            return A(f, args.concat(Array.prototype.slice.call(arguments)));
        };
        g.arity = f.arity - args.length;
        return g;
    }
}

/* Eval
   Evaluate the given thunk t into head normal form.
   If the "thunk" we get isn't actually a thunk, just return it.
*/
function E(t) {
    if(t instanceof T) {
        if(t.f instanceof F) {
            return t.f = t.f.f();
        } else {
            return t.f;
        }
    } else {
        return t;
    }
}

// Export Haste, A and E. Haste because we need to preserve exports, A and E
// because they're handy for Haste.Foreign.
if(!window) {
    var window = {};
}
window['Haste'] = Haste;
window['A'] = A;
window['E'] = E;


/* Throw an error.
   We need to be able to use throw as an exception so we wrap it in a function.
*/
function die(err) {
    throw err;
}

function quot(a, b) {
    return (a-a%b)/b;
}

function quotRemI(a, b) {
    return [0, (a-a%b)/b, a%b];
}

// 32 bit integer multiplication, with correct overflow behavior
// note that |0 or >>>0 needs to be applied to the result, for int and word
// respectively.
function imul(a, b) {
  // ignore high a * high a as the result will always be truncated
  var lows = (a & 0xffff) * (b & 0xffff); // low a * low b
  var aB = (a & 0xffff) * (b & 0xffff0000); // low a * high b
  var bA = (a & 0xffff0000) * (b & 0xffff); // low b * high a
  return lows + aB + bA; // sum will not exceed 52 bits, so it's safe
}

function addC(a, b) {
    var x = a+b;
    return [0, x & 0xffffffff, x > 0x7fffffff];
}

function subC(a, b) {
    var x = a-b;
    return [0, x & 0xffffffff, x < -2147483648];
}

function sinh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / 2;
}

function tanh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / (Math.exp(arg) + Math.exp(-arg));
}

function cosh (arg) {
    return (Math.exp(arg) + Math.exp(-arg)) / 2;
}

// Scratch space for byte arrays.
var rts_scratchBuf = new ArrayBuffer(8);
var rts_scratchW32 = new Uint32Array(rts_scratchBuf);
var rts_scratchFloat = new Float32Array(rts_scratchBuf);
var rts_scratchDouble = new Float64Array(rts_scratchBuf);

function decodeFloat(x) {
    rts_scratchFloat[0] = x;
    var sign = x < 0 ? -1 : 1;
    var exp = ((rts_scratchW32[0] >> 23) & 0xff) - 150;
    var man = rts_scratchW32[0] & 0x7fffff;
    if(exp === 0) {
        ++exp;
    } else {
        man |= (1 << 23);
    }
    return [0, sign*man, exp];
}

function decodeDouble(x) {
    rts_scratchDouble[0] = x;
    var sign = x < 0 ? -1 : 1;
    var manHigh = rts_scratchW32[1] & 0xfffff;
    var manLow = rts_scratchW32[0];
    var exp = ((rts_scratchW32[1] >> 20) & 0x7ff) - 1075;
    if(exp === 0) {
        ++exp;
    } else {
        manHigh |= (1 << 20);
    }
    return [0, sign, manHigh, manLow, exp];
}

function isFloatFinite(x) {
    return isFinite(x);
}

function isDoubleFinite(x) {
    return isFinite(x);
}

function err(str) {
    die(toJSStr(str));
}

/* unpackCString#
   NOTE: update constructor tags if the code generator starts munging them.
*/
function unCStr(str) {return unAppCStr(str, [0]);}

function unFoldrCStr(str, f, z) {
    var acc = z;
    for(var i = str.length-1; i >= 0; --i) {
        acc = A(f, [[0, str.charCodeAt(i)], acc]);
    }
    return acc;
}

function unAppCStr(str, chrs) {
    var i = arguments[2] ? arguments[2] : 0;
    if(i >= str.length) {
        return E(chrs);
    } else {
        return [1,[0,str.charCodeAt(i)],new T(function() {
            return unAppCStr(str,chrs,i+1);
        })];
    }
}

function charCodeAt(str, i) {return str.charCodeAt(i);}

function fromJSStr(str) {
    return unCStr(E(str));
}

function toJSStr(hsstr) {
    var s = '';
    for(var str = E(hsstr); str[0] == 1; str = E(str[2])) {
        s += String.fromCharCode(E(str[1])[1]);
    }
    return s;
}

// newMutVar
function nMV(val) {
    return ({x: val});
}

// readMutVar
function rMV(mv) {
    return mv.x;
}

// writeMutVar
function wMV(mv, val) {
    mv.x = val;
}

// atomicModifyMutVar
function mMV(mv, f) {
    var x = A(f, [mv.x]);
    mv.x = x[1];
    return x[2];
}

function localeEncoding() {
    var le = newByteArr(5);
    le['b']['i8'] = 'U'.charCodeAt(0);
    le['b']['i8'] = 'T'.charCodeAt(0);
    le['b']['i8'] = 'F'.charCodeAt(0);
    le['b']['i8'] = '-'.charCodeAt(0);
    le['b']['i8'] = '8'.charCodeAt(0);
    return le;
}

var isDoubleNaN = isNaN;
var isFloatNaN = isNaN;

function isDoubleInfinite(d) {
    return (d === Infinity);
}
var isFloatInfinite = isDoubleInfinite;

function isDoubleNegativeZero(x) {
    return (x===0 && (1/x)===-Infinity);
}
var isFloatNegativeZero = isDoubleNegativeZero;

function strEq(a, b) {
    return a == b;
}

function strOrd(a, b) {
    if(a < b) {
        return [0];
    } else if(a == b) {
        return [1];
    }
    return [2];
}

function jsCatch(act, handler) {
    try {
        return A(act,[0]);
    } catch(e) {
        return A(handler,[e, 0]);
    }
}

var coercionToken = undefined;

/* Haste represents constructors internally using 1 for the first constructor,
   2 for the second, etc.
   However, dataToTag should use 0, 1, 2, etc. Also, booleans might be unboxed.
 */
function dataToTag(x) {
    if(x instanceof Array) {
        return x[0];
    } else {
        return x;
    }
}

function __word_encodeDouble(d, e) {
    return d * Math.pow(2,e);
}

var __word_encodeFloat = __word_encodeDouble;
var jsRound = Math.round; // Stupid GHC doesn't like periods in FFI IDs...
var realWorld = undefined;
if(typeof _ == 'undefined') {
    var _ = undefined;
}

function popCnt(i) {
    i = i - ((i >> 1) & 0x55555555);
    i = (i & 0x33333333) + ((i >> 2) & 0x33333333);
    return (((i + (i >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function jsAlert(val) {
    if(typeof alert != 'undefined') {
        alert(val);
    } else {
        print(val);
    }
}

function jsLog(val) {
    console.log(val);
}

function jsPrompt(str) {
    var val;
    if(typeof prompt != 'undefined') {
        val = prompt(str);
    } else {
        print(str);
        val = readline();
    }
    return val == undefined ? '' : val.toString();
}

function jsEval(str) {
    var x = eval(str);
    return x == undefined ? '' : x.toString();
}

function isNull(obj) {
    return obj === null;
}

function jsRead(str) {
    return Number(str);
}

function jsShowI(val) {return val.toString();}
function jsShow(val) {
    var ret = val.toString();
    return val == Math.round(val) ? ret + '.0' : ret;
}

function jsGetMouseCoords(e) {
    var posx = 0;
    var posy = 0;
    if (!e) var e = window.event;
    if (e.pageX || e.pageY) 	{
	posx = e.pageX;
	posy = e.pageY;
    }
    else if (e.clientX || e.clientY) 	{
	posx = e.clientX + document.body.scrollLeft
	    + document.documentElement.scrollLeft;
	posy = e.clientY + document.body.scrollTop
	    + document.documentElement.scrollTop;
    }
    return [posx - (e.target.offsetLeft || 0),
	    posy - (e.target.offsetTop || 0)];
}

function jsSetCB(elem, evt, cb) {
    // Count return press in single line text box as a change event.
    if(evt == 'change' && elem.type.toLowerCase() == 'text') {
        setCB(elem, 'keyup', function(k) {
            if(k == '\n'.charCodeAt(0)) {
                A(cb,[[0,k.keyCode],0]);
            }
        });
    }

    var fun;
    switch(evt) {
    case 'click':
    case 'dblclick':
    case 'mouseup':
    case 'mousedown':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,x.button],[0,mx,my],0]);
        };
        break;
    case 'mousemove':
    case 'mouseover':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,mx,my],0]);
        };
        break;
    case 'keypress':
    case 'keyup':
    case 'keydown':
        fun = function(x) {A(cb,[[0,x.keyCode],0]);};
        break;        
    default:
        fun = function() {A(cb,[0]);};
        break;
    }
    return setCB(elem, evt, fun);
}

function setCB(elem, evt, cb) {
    if(elem.addEventListener) {
        elem.addEventListener(evt, cb, false);
        return true;
    } else if(elem.attachEvent) {
        elem.attachEvent('on'+evt, cb);
        return true;
    }
    return false;
}

function jsSetTimeout(msecs, cb) {
    window.setTimeout(function() {A(cb,[0]);}, msecs);
}

function jsGet(elem, prop) {
    return elem[prop].toString();
}

function jsSet(elem, prop, val) {
    elem[prop] = val;
}

function jsGetAttr(elem, prop) {
    if(elem.hasAttribute(prop)) {
        return elem.getAttribute(prop).toString();
    } else {
        return "";
    }
}

function jsSetAttr(elem, prop, val) {
    elem.setAttribute(prop, val);
}

function jsGetStyle(elem, prop) {
    return elem.style[prop].toString();
}

function jsSetStyle(elem, prop, val) {
    elem.style[prop] = val;
}

function jsKillChild(child, parent) {
    parent.removeChild(child);
}

function jsClearChildren(elem) {
    while(elem.hasChildNodes()){
        elem.removeChild(elem.lastChild);
    }
}

function jsFind(elem) {
    var e = document.getElementById(elem)
    if(e) {
        return [1,[0,e]];
    }
    return [0];
}

function jsCreateElem(tag) {
    return document.createElement(tag);
}

function jsCreateTextNode(str) {
    return document.createTextNode(str);
}

function jsGetChildBefore(elem) {
    elem = elem.previousSibling;
    while(elem) {
        if(typeof elem.tagName != 'undefined') {
            return [1,[0,elem]];
        }
        elem = elem.previousSibling;
    }
    return [0];
}

function jsGetLastChild(elem) {
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}


function jsGetFirstChild(elem) {
    var len = elem.childNodes.length;
    for(var i = 0; i < len; i++) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}


function jsGetChildren(elem) {
    var children = [0];
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            children = [1, [0,elem.childNodes[i]], children];
        }
    }
    return children;
}

function jsSetChildren(elem, children) {
    children = E(children);
    jsClearChildren(elem, 0);
    while(children[0] === 1) {
        elem.appendChild(E(E(children[1])[1]));
        children = E(children[2]);
    }
}

function jsAppendChild(child, container) {
    container.appendChild(child);
}

function jsAddChildBefore(child, container, after) {
    container.insertBefore(child, after);
}

var jsRand = Math.random;

// Concatenate a Haskell list of JS strings
function jsCat(strs, sep) {
    var arr = [];
    strs = E(strs);
    while(strs[0]) {
        strs = E(strs);
        arr.push(E(strs[1])[1]);
        strs = E(strs[2]);
    }
    return arr.join(sep);
}

var jsJSONParse = JSON.parse;

// JSON stringify a string
function jsStringify(str) {
    return JSON.stringify(str);
}

// Parse a JSON message into a Haste.JSON.JSON value.
// As this pokes around inside Haskell values, it'll need to be updated if:
// * Haste.JSON.JSON changes;
// * E() starts to choke on non-thunks;
// * data constructor code generation changes; or
// * Just and Nothing change tags.
function jsParseJSON(str) {
    try {
        var js = JSON.parse(str);
        var hs = toHS(js);
    } catch(_) {
        return [0];
    }
    return [1,hs];
}

function toHS(obj) {
    switch(typeof obj) {
    case 'number':
        return [0, [0, jsRead(obj)]];
    case 'string':
        return [1, [0, obj]];
        break;
    case 'boolean':
        return [2, obj]; // Booleans are special wrt constructor tags!
        break;
    case 'object':
        if(obj instanceof Array) {
            return [3, arr2lst_json(obj, 0)];
        } else {
            // Object type but not array - it's a dictionary.
            // The RFC doesn't say anything about the ordering of keys, but
            // considering that lots of people rely on keys being "in order" as
            // defined by "the same way someone put them in at the other end,"
            // it's probably a good idea to put some cycles into meeting their
            // misguided expectations.
            var ks = [];
            for(var k in obj) {
                ks.unshift(k);
            }
            var xs = [0];
            for(var i = 0; i < ks.length; i++) {
                xs = [1, [0, [0,ks[i]], toHS(obj[ks[i]])], xs];
            }
            return [4, xs];
        }
    }
}

function arr2lst_json(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, toHS(arr[elem]), new T(function() {return arr2lst_json(arr,elem+1);})]
}

function arr2lst(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, arr[elem], new T(function() {return arr2lst(arr,elem+1);})]
}

function lst2arr(xs) {
    var arr = [];
    for(; xs[0]; xs = E(xs[2])) {
        arr.push(E(xs[1]));
    }
    return arr;
}

function ajaxReq(method, url, async, postdata, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, async);
    xhr.setRequestHeader('Cache-control', 'no-cache');
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                A(cb,[[1,[0,xhr.responseText]],0]);
            } else {
                A(cb,[[0],0]); // Nothing
            }
        }
    }
    xhr.send(postdata);
}

// Create a little endian ArrayBuffer representation of something.
function toABHost(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    return a;
}

function toABSwap(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    var bs = new Uint8Array(a);
    for(var i = 0, j = n-1; i < j; ++i, --j) {
        var tmp = bs[i];
        bs[i] = bs[j];
        bs[j] = tmp;
    }
    return a;
}

window['toABle'] = toABHost;
window['toABbe'] = toABSwap;

// Swap byte order if host is not little endian.
var buffer = new ArrayBuffer(2);
new DataView(buffer).setInt16(0, 256, true);
if(new Int16Array(buffer)[0] !== 256) {
    window['toABle'] = toABSwap;
    window['toABbe'] = toABHost;
}

// MVar implementation.
// Since Haste isn't concurrent, takeMVar and putMVar don't block on empty
// and full MVars respectively, but terminate the program since they would
// otherwise be blocking forever.

function newMVar() {
    return ({empty: true});
}

function tryTakeMVar(mv) {
    if(mv.empty) {
        return [0, 0, undefined];
    } else {
        var val = mv.x;
        mv.empty = true;
        mv.x = null;
        return [0, 1, val];
    }
}

function takeMVar(mv) {
    if(mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to take empty MVar!");
    }
    var val = mv.x;
    mv.empty = true;
    mv.x = null;
    return val;
}

function putMVar(mv, val) {
    if(!mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to put full MVar!");
    }
    mv.empty = false;
    mv.x = val;
}

function tryPutMVar(mv, val) {
    if(!mv.empty) {
        return 0;
    } else {
        mv.empty = false;
        mv.x = val;
        return 1;
    }
}

function sameMVar(a, b) {
    return (a == b);
}

function isEmptyMVar(mv) {
    return mv.empty ? 1 : 0;
}

// Implementation of stable names.
// Unlike native GHC, the garbage collector isn't going to move data around
// in a way that we can detect, so each object could serve as its own stable
// name if it weren't for the fact we can't turn a JS reference into an
// integer.
// So instead, each object has a unique integer attached to it, which serves
// as its stable name.

var __next_stable_name = 1;

function makeStableName(x) {
    if(!x.stableName) {
        x.stableName = __next_stable_name;
        __next_stable_name += 1;
    }
    return x.stableName;
}

function eqStableName(x, y) {
    return (x == y) ? 1 : 0;
}

var Integer = function(bits, sign) {
  this.bits_ = [];
  this.sign_ = sign;

  var top = true;
  for (var i = bits.length - 1; i >= 0; i--) {
    var val = bits[i] | 0;
    if (!top || val != sign) {
      this.bits_[i] = val;
      top = false;
    }
  }
};

Integer.IntCache_ = {};

var I_fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Integer.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Integer([value | 0], value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Integer.IntCache_[value] = obj;
  }
  return obj;
};

var I_fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Integer.ZERO;
  } else if (value < 0) {
    return I_negate(I_fromNumber(-value));
  } else {
    var bits = [];
    var pow = 1;
    for (var i = 0; value >= pow; i++) {
      bits[i] = (value / pow) | 0;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return new Integer(bits, 0);
  }
};

var I_fromBits = function(bits) {
  var high = bits[bits.length - 1];
  return new Integer(bits, high & (1 << 31) ? -1 : 0);
};

var I_fromString = function(str, opt_radix) {
  if (str.length == 0) {
    throw Error('number format error: empty string');
  }

  var radix = opt_radix || 10;
  if (radix < 2 || 36 < radix) {
    throw Error('radix out of range: ' + radix);
  }

  if (str.charAt(0) == '-') {
    return I_negate(I_fromString(str.substring(1), radix));
  } else if (str.indexOf('-') >= 0) {
    throw Error('number format error: interior "-" character');
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 8));

  var result = Integer.ZERO;
  for (var i = 0; i < str.length; i += 8) {
    var size = Math.min(8, str.length - i);
    var value = parseInt(str.substring(i, i + size), radix);
    if (size < 8) {
      var power = I_fromNumber(Math.pow(radix, size));
      result = I_add(I_mul(result, power), I_fromNumber(value));
    } else {
      result = I_mul(result, radixToPower);
      result = I_add(result, I_fromNumber(value));
    }
  }
  return result;
};


Integer.TWO_PWR_32_DBL_ = (1 << 16) * (1 << 16);
Integer.ZERO = I_fromInt(0);
Integer.ONE = I_fromInt(1);
Integer.TWO_PWR_24_ = I_fromInt(1 << 24);

var I_toInt = function(self) {
  return self.bits_.length > 0 ? self.bits_[0] : self.sign_;
};

var I_toWord = function(self) {
  return I_toInt(self) >>> 0;
};

var I_toNumber = function(self) {
  if (isNegative(self)) {
    return -I_toNumber(I_negate(self));
  } else {
    var val = 0;
    var pow = 1;
    for (var i = 0; i < self.bits_.length; i++) {
      val += I_getBitsUnsigned(self, i) * pow;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return val;
  }
};

var I_getBits = function(self, index) {
  if (index < 0) {
    return 0;
  } else if (index < self.bits_.length) {
    return self.bits_[index];
  } else {
    return self.sign_;
  }
};

var I_getBitsUnsigned = function(self, index) {
  var val = I_getBits(self, index);
  return val >= 0 ? val : Integer.TWO_PWR_32_DBL_ + val;
};

var getSign = function(self) {
  return self.sign_;
};

var isZero = function(self) {
  if (self.sign_ != 0) {
    return false;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    if (self.bits_[i] != 0) {
      return false;
    }
  }
  return true;
};

var isNegative = function(self) {
  return self.sign_ == -1;
};

var isOdd = function(self) {
  return (self.bits_.length == 0) && (self.sign_ == -1) ||
         (self.bits_.length > 0) && ((self.bits_[0] & 1) != 0);
};

var I_equals = function(self, other) {
  if (self.sign_ != other.sign_) {
    return false;
  }
  var len = Math.max(self.bits_.length, other.bits_.length);
  for (var i = 0; i < len; i++) {
    if (I_getBits(self, i) != I_getBits(other, i)) {
      return false;
    }
  }
  return true;
};

var I_notEquals = function(self, other) {
  return !I_equals(self, other);
};

var I_greaterThan = function(self, other) {
  return I_compare(self, other) > 0;
};

var I_greaterThanOrEqual = function(self, other) {
  return I_compare(self, other) >= 0;
};

var I_lessThan = function(self, other) {
  return I_compare(self, other) < 0;
};

var I_lessThanOrEqual = function(self, other) {
  return I_compare(self, other) <= 0;
};

var I_compare = function(self, other) {
  var diff = I_sub(self, other);
  if (isNegative(diff)) {
    return -1;
  } else if (isZero(diff)) {
    return 0;
  } else {
    return +1;
  }
};

var I_compareInt = function(self, other) {
  return I_compare(self, I_fromInt(other));
}

var shorten = function(self, numBits) {
  var arr_index = (numBits - 1) >> 5;
  var bit_index = (numBits - 1) % 32;
  var bits = [];
  for (var i = 0; i < arr_index; i++) {
    bits[i] = I_getBits(self, i);
  }
  var sigBits = bit_index == 31 ? 0xFFFFFFFF : (1 << (bit_index + 1)) - 1;
  var val = I_getBits(self, arr_index) & sigBits;
  if (val & (1 << bit_index)) {
    val |= 0xFFFFFFFF - sigBits;
    bits[arr_index] = val;
    return new Integer(bits, -1);
  } else {
    bits[arr_index] = val;
    return new Integer(bits, 0);
  }
};

var I_negate = function(self) {
  return I_add(not(self), Integer.ONE);
};

var I_add = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  var carry = 0;

  for (var i = 0; i <= len; i++) {
    var a1 = I_getBits(self, i) >>> 16;
    var a0 = I_getBits(self, i) & 0xFFFF;

    var b1 = I_getBits(other, i) >>> 16;
    var b0 = I_getBits(other, i) & 0xFFFF;

    var c0 = carry + a0 + b0;
    var c1 = (c0 >>> 16) + a1 + b1;
    carry = c1 >>> 16;
    c0 &= 0xFFFF;
    c1 &= 0xFFFF;
    arr[i] = (c1 << 16) | c0;
  }
  return I_fromBits(arr);
};

var I_sub = function(self, other) {
  return I_add(self, I_negate(other));
};

var I_mul = function(self, other) {
  if (isZero(self)) {
    return Integer.ZERO;
  } else if (isZero(other)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_mul(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_mul(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_mul(self, I_negate(other)));
  }

  if (I_lessThan(self, Integer.TWO_PWR_24_) &&
      I_lessThan(other, Integer.TWO_PWR_24_)) {
    return I_fromNumber(I_toNumber(self) * I_toNumber(other));
  }

  var len = self.bits_.length + other.bits_.length;
  var arr = [];
  for (var i = 0; i < 2 * len; i++) {
    arr[i] = 0;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    for (var j = 0; j < other.bits_.length; j++) {
      var a1 = I_getBits(self, i) >>> 16;
      var a0 = I_getBits(self, i) & 0xFFFF;

      var b1 = I_getBits(other, j) >>> 16;
      var b0 = I_getBits(other, j) & 0xFFFF;

      arr[2 * i + 2 * j] += a0 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j);
      arr[2 * i + 2 * j + 1] += a1 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 1] += a0 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 2] += a1 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 2);
    }
  }

  for (var i = 0; i < len; i++) {
    arr[i] = (arr[2 * i + 1] << 16) | arr[2 * i];
  }
  for (var i = len; i < 2 * len; i++) {
    arr[i] = 0;
  }
  return new Integer(arr, 0);
};

Integer.carry16_ = function(bits, index) {
  while ((bits[index] & 0xFFFF) != bits[index]) {
    bits[index + 1] += bits[index] >>> 16;
    bits[index] &= 0xFFFF;
  }
};

var I_mod = function(self, other) {
  return I_rem(I_add(other, I_rem(self, other)), other);
}

var I_div = function(self, other) {
  if(I_greaterThan(self, Integer.ZERO) != I_greaterThan(other, Integer.ZERO)) {
    if(I_rem(self, other) != Integer.ZERO) {
      return I_sub(I_quot(self, other), Integer.ONE);
    }
  }
  return I_quot(self, other);
}

var I_quotRem = function(self, other) {
  return [0, I_quot(self, other), I_rem(self, other)];
}

var I_divMod = function(self, other) {
  return [0, I_div(self, other), I_mod(self, other)];
}

var I_quot = function(self, other) {
  if (isZero(other)) {
    throw Error('division by zero');
  } else if (isZero(self)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_quot(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_quot(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_quot(self, I_negate(other)));
  }

  var res = Integer.ZERO;
  var rem = self;
  while (I_greaterThanOrEqual(rem, other)) {
    var approx = Math.max(1, Math.floor(I_toNumber(rem) / I_toNumber(other)));
    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);
    var approxRes = I_fromNumber(approx);
    var approxRem = I_mul(approxRes, other);
    while (isNegative(approxRem) || I_greaterThan(approxRem, rem)) {
      approx -= delta;
      approxRes = I_fromNumber(approx);
      approxRem = I_mul(approxRes, other);
    }

    if (isZero(approxRes)) {
      approxRes = Integer.ONE;
    }

    res = I_add(res, approxRes);
    rem = I_sub(rem, approxRem);
  }
  return res;
};

var I_rem = function(self, other) {
  return I_sub(self, I_mul(I_quot(self, other), other));
};

var not = function(self) {
  var len = self.bits_.length;
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = ~self.bits_[i];
  }
  return new Integer(arr, ~self.sign_);
};

var I_and = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) & I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ & other.sign_);
};

var I_or = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) | I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ | other.sign_);
};

var I_xor = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) ^ I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ ^ other.sign_);
};

var I_shiftLeft = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length + arr_delta + (bit_delta > 0 ? 1 : 0);
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i - arr_delta) << bit_delta) |
               (I_getBits(self, i - arr_delta - 1) >>> (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i - arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_shiftRight = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length - arr_delta;
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i + arr_delta) >>> bit_delta) |
               (I_getBits(self, i + arr_delta + 1) << (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i + arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_signum = function(self) {
  var cmp = I_compare(self, Integer.ZERO);
  if(cmp > 0) {
    return Integer.ONE
  }
  if(cmp < 0) {
    return I_sub(Integer.ZERO, Integer.ONE);
  }
  return Integer.ZERO;
};

var I_abs = function(self) {
  if(I_compare(self, Integer.ZERO) < 0) {
    return I_sub(Integer.ZERO, self);
  }
  return self;
};

var I_decodeDouble = function(x) {
  var dec = decodeDouble(x);
  var mantissa = I_fromBits([dec[3], dec[2]]);
  if(dec[1] < 0) {
    mantissa = I_negate(mantissa);
  }
  return [0, dec[4], mantissa];
}

var I_toString = function(self) {
  var radix = 10;

  if (isZero(self)) {
    return '0';
  } else if (isNegative(self)) {
    return '-' + I_toString(I_negate(self));
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 6));

  var rem = self;
  var result = '';
  while (true) {
    var remDiv = I_div(rem, radixToPower);
    var intval = I_toInt(I_sub(rem, I_mul(remDiv, radixToPower)));
    var digits = intval.toString();

    rem = remDiv;
    if (isZero(rem)) {
      return digits + result;
    } else {
      while (digits.length < 6) {
        digits = '0' + digits;
      }
      result = '' + digits + result;
    }
  }
};

var I_fromRat = function(a, b) {
    return I_toNumber(a) / I_toNumber(b);
}

function I_fromInt64(x) {
    return I_fromBits([x.getLowBits(), x.getHighBits()]);
}

function I_toInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

function I_fromWord64(x) {
    return x;
}

function I_toWord64(x) {
    return I_rem(I_add(__w64_max, x), __w64_max);
}

// Copyright 2009 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var Long = function(low, high) {
  this.low_ = low | 0;
  this.high_ = high | 0;
};

Long.IntCache_ = {};

Long.fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Long.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Long(value | 0, value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Long.IntCache_[value] = obj;
  }
  return obj;
};

Long.fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Long.ZERO;
  } else if (value <= -Long.TWO_PWR_63_DBL_) {
    return Long.MIN_VALUE;
  } else if (value + 1 >= Long.TWO_PWR_63_DBL_) {
    return Long.MAX_VALUE;
  } else if (value < 0) {
    return Long.fromNumber(-value).negate();
  } else {
    return new Long(
        (value % Long.TWO_PWR_32_DBL_) | 0,
        (value / Long.TWO_PWR_32_DBL_) | 0);
  }
};

Long.fromBits = function(lowBits, highBits) {
  return new Long(lowBits, highBits);
};

Long.TWO_PWR_16_DBL_ = 1 << 16;
Long.TWO_PWR_24_DBL_ = 1 << 24;
Long.TWO_PWR_32_DBL_ =
    Long.TWO_PWR_16_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_31_DBL_ =
    Long.TWO_PWR_32_DBL_ / 2;
Long.TWO_PWR_48_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_64_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_32_DBL_;
Long.TWO_PWR_63_DBL_ =
    Long.TWO_PWR_64_DBL_ / 2;
Long.ZERO = Long.fromInt(0);
Long.ONE = Long.fromInt(1);
Long.NEG_ONE = Long.fromInt(-1);
Long.MAX_VALUE =
    Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
Long.MIN_VALUE = Long.fromBits(0, 0x80000000 | 0);
Long.TWO_PWR_24_ = Long.fromInt(1 << 24);

Long.prototype.toInt = function() {
  return this.low_;
};

Long.prototype.toNumber = function() {
  return this.high_ * Long.TWO_PWR_32_DBL_ +
         this.getLowBitsUnsigned();
};

Long.prototype.getHighBits = function() {
  return this.high_;
};

Long.prototype.getLowBits = function() {
  return this.low_;
};

Long.prototype.getLowBitsUnsigned = function() {
  return (this.low_ >= 0) ?
      this.low_ : Long.TWO_PWR_32_DBL_ + this.low_;
};

Long.prototype.isZero = function() {
  return this.high_ == 0 && this.low_ == 0;
};

Long.prototype.isNegative = function() {
  return this.high_ < 0;
};

Long.prototype.isOdd = function() {
  return (this.low_ & 1) == 1;
};

Long.prototype.equals = function(other) {
  return (this.high_ == other.high_) && (this.low_ == other.low_);
};

Long.prototype.notEquals = function(other) {
  return (this.high_ != other.high_) || (this.low_ != other.low_);
};

Long.prototype.lessThan = function(other) {
  return this.compare(other) < 0;
};

Long.prototype.lessThanOrEqual = function(other) {
  return this.compare(other) <= 0;
};

Long.prototype.greaterThan = function(other) {
  return this.compare(other) > 0;
};

Long.prototype.greaterThanOrEqual = function(other) {
  return this.compare(other) >= 0;
};

Long.prototype.compare = function(other) {
  if (this.equals(other)) {
    return 0;
  }

  var thisNeg = this.isNegative();
  var otherNeg = other.isNegative();
  if (thisNeg && !otherNeg) {
    return -1;
  }
  if (!thisNeg && otherNeg) {
    return 1;
  }

  if (this.subtract(other).isNegative()) {
    return -1;
  } else {
    return 1;
  }
};

Long.prototype.negate = function() {
  if (this.equals(Long.MIN_VALUE)) {
    return Long.MIN_VALUE;
  } else {
    return this.not().add(Long.ONE);
  }
};

Long.prototype.add = function(other) {
  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 + b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 + b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 + b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 + b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.subtract = function(other) {
  return this.add(other.negate());
};

Long.prototype.multiply = function(other) {
  if (this.isZero()) {
    return Long.ZERO;
  } else if (other.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  } else if (other.equals(Long.MIN_VALUE)) {
    return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().multiply(other.negate());
    } else {
      return this.negate().multiply(other).negate();
    }
  } else if (other.isNegative()) {
    return this.multiply(other.negate()).negate();
  }

  if (this.lessThan(Long.TWO_PWR_24_) &&
      other.lessThan(Long.TWO_PWR_24_)) {
    return Long.fromNumber(this.toNumber() * other.toNumber());
  }

  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 * b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 * b00;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c16 += a00 * b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 * b00;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a16 * b16;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a00 * b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.div = function(other) {
  if (other.isZero()) {
    throw Error('division by zero');
  } else if (this.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    if (other.equals(Long.ONE) ||
        other.equals(Long.NEG_ONE)) {
      return Long.MIN_VALUE;
    } else if (other.equals(Long.MIN_VALUE)) {
      return Long.ONE;
    } else {
      var halfThis = this.shiftRight(1);
      var approx = halfThis.div(other).shiftLeft(1);
      if (approx.equals(Long.ZERO)) {
        return other.isNegative() ? Long.ONE : Long.NEG_ONE;
      } else {
        var rem = this.subtract(other.multiply(approx));
        var result = approx.add(rem.div(other));
        return result;
      }
    }
  } else if (other.equals(Long.MIN_VALUE)) {
    return Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().div(other.negate());
    } else {
      return this.negate().div(other).negate();
    }
  } else if (other.isNegative()) {
    return this.div(other.negate()).negate();
  }

  var res = Long.ZERO;
  var rem = this;
  while (rem.greaterThanOrEqual(other)) {
    var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

    var approxRes = Long.fromNumber(approx);
    var approxRem = approxRes.multiply(other);
    while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
      approx -= delta;
      approxRes = Long.fromNumber(approx);
      approxRem = approxRes.multiply(other);
    }

    if (approxRes.isZero()) {
      approxRes = Long.ONE;
    }

    res = res.add(approxRes);
    rem = rem.subtract(approxRem);
  }
  return res;
};

Long.prototype.modulo = function(other) {
  return this.subtract(this.div(other).multiply(other));
};

Long.prototype.not = function() {
  return Long.fromBits(~this.low_, ~this.high_);
};

Long.prototype.and = function(other) {
  return Long.fromBits(this.low_ & other.low_,
                                 this.high_ & other.high_);
};

Long.prototype.or = function(other) {
  return Long.fromBits(this.low_ | other.low_,
                                 this.high_ | other.high_);
};

Long.prototype.xor = function(other) {
  return Long.fromBits(this.low_ ^ other.low_,
                                 this.high_ ^ other.high_);
};

Long.prototype.shiftLeft = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var low = this.low_;
    if (numBits < 32) {
      var high = this.high_;
      return Long.fromBits(
          low << numBits,
          (high << numBits) | (low >>> (32 - numBits)));
    } else {
      return Long.fromBits(0, low << (numBits - 32));
    }
  }
};

Long.prototype.shiftRight = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >> numBits);
    } else {
      return Long.fromBits(
          high >> (numBits - 32),
          high >= 0 ? 0 : -1);
    }
  }
};

Long.prototype.shiftRightUnsigned = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >>> numBits);
    } else if (numBits == 32) {
      return Long.fromBits(high, 0);
    } else {
      return Long.fromBits(high >>> (numBits - 32), 0);
    }
  }
};



// Int64
function hs_eqInt64(x, y) {return x.equals(y);}
function hs_neInt64(x, y) {return !x.equals(y);}
function hs_ltInt64(x, y) {return x.compare(y) < 0;}
function hs_leInt64(x, y) {return x.compare(y) <= 0;}
function hs_gtInt64(x, y) {return x.compare(y) > 0;}
function hs_geInt64(x, y) {return x.compare(y) >= 0;}
function hs_quotInt64(x, y) {return x.div(y);}
function hs_remInt64(x, y) {return x.modulo(y);}
function hs_plusInt64(x, y) {return x.add(y);}
function hs_minusInt64(x, y) {return x.subtract(y);}
function hs_timesInt64(x, y) {return x.multiply(y);}
function hs_negateInt64(x) {return x.negate();}
function hs_uncheckedIShiftL64(x, bits) {x.shiftLeft(bits);}
function hs_uncheckedIShiftRA64(x, bits) {x.shiftRight(bits);}
function hs_uncheckedIShiftRL64(x, bits) {x.shiftRightUnsigned(bits);}
function hs_intToInt64(x) {return new Long(x, 0);}
function hs_int64ToInt(x) {return x.toInt();}



// Word64
function hs_wordToWord64(x) {
    return I_fromInt(x);
}
function hs_word64ToWord(x) {
    return I_toInt(x);
}
function hs_mkWord64(low, high) {
    return I_fromBits([low, high]);
}

var hs_and64 = I_and;
var hs_or64 = I_or;
var hs_xor64 = I_xor;
var __i64_all_ones = I_fromBits([0xffffffff, 0xffffffff]);
function hs_not64(x) {
    return I_xor(x, __i64_all_ones);
}
var hs_eqWord64 = I_equals;
var hs_neWord64 = I_notEquals;
var hs_ltWord64 = I_lessThan;
var hs_leWord64 = I_lessThanOrEqual;
var hs_gtWord64 = I_greaterThan;
var hs_geWord64 = I_greaterThanOrEqual;
var hs_quotWord64 = I_quot;
var hs_remWord64 = I_rem;
var __w64_max = I_fromBits([0,0,1]);
function hs_uncheckedShiftL64(x, bits) {
    return I_rem(I_shiftLeft(x, bits), __w64_max);
}
var hs_uncheckedShiftRL64 = I_shiftRight;
function hs_int64ToWord64(x) {
    var tmp = I_add(__w64_max, I_fromBits([x.getLowBits(), x.getHighBits()]));
    return I_rem(tmp, __w64_max);
}
function hs_word64ToInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

// Joseph Myers' MD5 implementation; used under the BSD license.

function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = gg(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

function md5blk(s) {
var md5blks = [], i;
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

// Functions for dealing with arrays.

function newArr(n, x) {
    var arr = [];
    for(; n >= 0; --n) {
        arr.push(x);
    }
    return arr;
}

// Create all views at once; perhaps it's wasteful, but it's better than having
// to check for the right view at each read or write.
function newByteArr(n) {
    // Pad the thing to multiples of 8.
    var padding = 8 - n % 8;
    if(padding < 8) {
        n += padding;
    }
    var arr = {};
    var buffer = new ArrayBuffer(n);
    var views = {};
    views['i8']  = new Int8Array(buffer);
    views['i16'] = new Int16Array(buffer);
    views['i32'] = new Int32Array(buffer);
    views['w8']  = new Uint8Array(buffer);
    views['w16'] = new Uint16Array(buffer);
    views['w32'] = new Uint32Array(buffer);
    views['f32'] = new Float32Array(buffer);
    views['f64'] = new Float64Array(buffer);
    arr['b'] = buffer;
    arr['v'] = views;
    // ByteArray and Addr are the same thing, so keep an offset if we get
    // casted.
    arr['off'] = 0;
    return arr;
}

// An attempt at emulating pointers enough for ByteString and Text to be
// usable without patching the hell out of them.
// The general idea is that Addr# is a byte array with an associated offset.

function plusAddr(addr, off) {
    var newaddr = {};
    newaddr['off'] = addr['off'] + off;
    newaddr['b']   = addr['b'];
    newaddr['v']   = addr['v'];
    return newaddr;
}

function writeOffAddr(type, elemsize, addr, off, x) {
    addr['v'][type][addr.off/elemsize + off] = x;
}

function readOffAddr(type, elemsize, addr, off) {
    return addr['v'][type][addr.off/elemsize + off];
}

// Two addresses are equal if they point to the same buffer and have the same
// offset. For other comparisons, just use the offsets - nobody in their right
// mind would check if one pointer is less than another, completely unrelated,
// pointer and then act on that information anyway.
function addrEq(a, b) {
    if(a == b) {
        return true;
    }
    return a && b && a['b'] == b['b'] && a['off'] == b['off'];
}

function addrLT(a, b) {
    if(a) {
        return b && a['off'] < b['off'];
    } else {
        return (b != 0); 
    }
}

function addrGT(a, b) {
    if(b) {
        return a && a['off'] > b['off'];
    } else {
        return (a != 0);
    }
}

function withChar(f, charCode) {
    return f(String.fromCharCode(charCode)).charCodeAt(0);
}

function u_towlower(charCode) {
    return withChar(function(c) {return c.toLowerCase()}, charCode);
}

function u_towupper(charCode) {
    return withChar(function(c) {return c.toUpperCase()}, charCode);
}

var u_towtitle = u_towupper;

function u_iswupper(charCode) {
    var c = String.fromCharCode(charCode);
    return c == c.toUpperCase() && c != c.toLowerCase();
}

function u_iswlower(charCode) {
    var c = String.fromCharCode(charCode);
    return  c == c.toLowerCase() && c != c.toUpperCase();
}

function u_iswdigit(charCode) {
    return charCode >= 48 && charCode <= 57;
}

function u_iswcntrl(charCode) {
    return charCode <= 0x1f || charCode == 0x7f;
}

function u_iswspace(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(/\s/g,'') != c;
}

function u_iswalpha(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(__hs_alphare, '') != c;
}

function u_iswalnum(charCode) {
    return u_iswdigit(charCode) || u_iswalpha(charCode);
}

function u_iswprint(charCode) {
    return !u_iswcntrl(charCode);
}

function u_gencat(c) {
    throw 'u_gencat is only supported with --full-unicode.';
}

// Regex that matches any alphabetic character in any language. Horrible thing.
var __hs_alphare = /[\u0041-\u005A\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/g;

// 2D Canvas drawing primitives.
function jsHasCtx2D(elem) {return !!elem.getContext;}
function jsGetCtx2D(elem) {return elem.getContext('2d');}
function jsBeginPath(ctx) {ctx.beginPath();}
function jsMoveTo(ctx, x, y) {ctx.moveTo(x, y);}
function jsLineTo(ctx, x, y) {ctx.lineTo(x, y);}
function jsStroke(ctx) {ctx.stroke();}
function jsFill(ctx) {ctx.fill();}
function jsRotate(ctx, radians) {ctx.rotate(radians);}
function jsTranslate(ctx, x, y) {ctx.translate(x, y);}
function jsScale(ctx, x, y) {ctx.scale(x, y);}
function jsPushState(ctx) {ctx.save();}
function jsPopState(ctx) {ctx.restore();}
function jsResetCanvas(el) {el.width = el.width;}
function jsDrawImage(ctx, img, x, y) {ctx.drawImage(img, x, y);}
function jsDrawImageClipped(ctx, img, x, y, cx, cy, cw, ch) {
    ctx.drawImage(img, cx, cy, cw, ch, x, y, cw, ch);
}
function jsDrawText(ctx, str, x, y) {ctx.fillText(str, x, y);}
function jsClip(ctx) {ctx.clip();}
function jsArc(ctx, x, y, radius, fromAngle, toAngle) {
    ctx.arc(x, y, radius, fromAngle, toAngle);
}
function jsCanvasToDataURL(el) {return el.toDataURL('image/png');}

// Simulate handles.
// When implementing new handles, remember that passed strings may be thunks,
// and so need to be evaluated before use.

function jsNewHandle(init, read, write, flush, close, seek, tell) {
    var h = {
        read: read || function() {},
        write: write || function() {},
        seek: seek || function() {},
        tell: tell || function() {},
        close: close || function() {},
        flush: flush || function() {}
    };
    init.call(h);
    return h;
}

function jsReadHandle(h, len) {return h.read(len);}
function jsWriteHandle(h, str) {return h.write(str);}
function jsFlushHandle(h) {return h.flush();}
function jsCloseHandle(h) {return h.close();}

function jsMkConWriter(op) {
    return function(str) {
        str = E(str);
        var lines = (this.buf + str).split('\n');
        for(var i = 0; i < lines.length-1; ++i) {
            op.call(console, lines[i]);
        }
        this.buf = lines[lines.length-1];
    }
}

function jsMkStdout() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.log),
        function() {console.log(this.buf); this.buf = '';}
    );
}

function jsMkStderr() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.warn),
        function() {console.warn(this.buf); this.buf = '';}
    );
}

function jsMkStdin() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(len) {
            while(this.buf.length < len) {
                this.buf += prompt('[stdin]') + '\n';
            }
            var ret = this.buf.substr(0, len);
            this.buf = this.buf.substr(len);
            return ret;
        }
    );
}

var _0=false,_1=new T(function(){return [0,"(function(e){return e.parentNode;})"];}),_2=function(_3){var _4=A(_3,[_]);return E(_4);},_5=function(_6){return _2(function(_){var _=0;return eval(E(_6)[1]);});},_7=new T(function(){return _5(_1);}),_8=[0,0],_9=[0],_a=function(_b,_){return _9;},_c=function(_){return _9;},_d=[0,_c,_a],_e=2,_f=[1],_g=[0],_h=[0,_g,_8,_e,_d,_0,_f],_i=function(_){var _=0,_j=newMVar(),_=putMVar(_j,_h);return [0,_j];},_k=new T(function(){return _2(_i);}),_l=function(_m,_n,_){var _o=E(_k)[1],_p=takeMVar(_o),_q=A(_m,[_p,_]),_r=E(_q),_s=E(_r[1]),_t=_s[1],_u=_s[2],_=putMVar(_o,new T(function(){var _v=E(_r[2]);return [0,_v[1],_v[2],_v[3],_v[4],_0,_v[6]];}));if(!E(E(_p)[5])){var _w=A(_t,[_n,_]);return _u;}else{var _x=A(_7,[E(E(_n)[1]),_]),_y=A(_t,[[0,_x],_]);return _u;}},_z=unCStr("id"),_A=0,_B=function(_C,_D,_E,_F){return A(_C,[new T(function(){return function(_){var _G=jsSetAttr(E(_D)[1],toJSStr(E(_E)),toJSStr(E(_F)));return _A;};})]);},_H=function(_I){return E(_I);},_J=function(_K,_L,_M,_){var _N=E(_L),_O=A(_K,[_M,_]),_P=A(_B,[_H,_O,_N[1],_N[2],_]);return _O;},_Q=function(_R,_S){while(1){var _T=(function(_U,_V){var _W=E(_V);if(!_W[0]){return E(_U);}else{_R=function(_X,_){return _J(_U,_W[1],_X,_);};_S=_W[2];return null;}})(_R,_S);if(_T!=null){return _T;}}},_Y=function(_Z,_10,_){return [0,_A,_Z];},_11=function(_12,_){return [0,_12,_12];},_13=[0,coercionToken],_14=function(_15,_16,_){var _17=A(_15,[_]);return A(_16,[_]);},_18=function(_19,_1a,_){return _14(_19,_1a,_);},_1b=function(_1c,_1d,_){var _1e=A(_1c,[_]);return A(_1d,[_1e,_]);},_1f=unCStr("base"),_1g=unCStr("GHC.IO.Exception"),_1h=unCStr("IOException"),_1i=[0,I_fromBits([4053623282,1685460941]),I_fromBits([3693590983,2507416641]),_1f,_1g,_1h],_1j=[0,I_fromBits([4053623282,1685460941]),I_fromBits([3693590983,2507416641]),_1i,_g],_1k=function(_1l){return E(_1j);},_1m=function(_1n){return E(E(_1n)[1]);},_1o=unCStr("Maybe.fromJust: Nothing"),_1p=new T(function(){return err(_1o);}),_1q=function(_1r,_1s,_1t){var _1u=new T(function(){var _1v=A(_1r,[_1t]),_1w=A(_1s,[new T(function(){var _1x=E(_1u);return _1x[0]==0?E(_1p):E(_1x[1]);})]),_1y=hs_eqWord64(_1v[1],_1w[1]);if(!E(_1y)){return [0];}else{var _1z=hs_eqWord64(_1v[2],_1w[2]);return E(_1z)==0?[0]:[1,_1t];}});return E(_1u);},_1A=function(_1B){var _1C=E(_1B);return _1q(_1m(_1C[1]),_1k,_1C[2]);},_1D=unCStr(": "),_1E=[0,41],_1F=unCStr(" ("),_1G=function(_1H,_1I){var _1J=E(_1H);return _1J[0]==0?E(_1I):[1,_1J[1],new T(function(){return _1G(_1J[2],_1I);})];},_1K=unCStr("already exists"),_1L=unCStr("does not exist"),_1M=unCStr("protocol error"),_1N=unCStr("failed"),_1O=unCStr("invalid argument"),_1P=unCStr("inappropriate type"),_1Q=unCStr("hardware fault"),_1R=unCStr("unsupported operation"),_1S=unCStr("timeout"),_1T=unCStr("resource vanished"),_1U=unCStr("interrupted"),_1V=unCStr("resource busy"),_1W=unCStr("resource exhausted"),_1X=unCStr("end of file"),_1Y=unCStr("illegal operation"),_1Z=unCStr("permission denied"),_20=unCStr("user error"),_21=unCStr("unsatisified constraints"),_22=unCStr("system error"),_23=function(_24,_25){switch(E(_24)){case 0:return _1G(_1K,_25);case 1:return _1G(_1L,_25);case 2:return _1G(_1V,_25);case 3:return _1G(_1W,_25);case 4:return _1G(_1X,_25);case 5:return _1G(_1Y,_25);case 6:return _1G(_1Z,_25);case 7:return _1G(_20,_25);case 8:return _1G(_21,_25);case 9:return _1G(_22,_25);case 10:return _1G(_1M,_25);case 11:return _1G(_1N,_25);case 12:return _1G(_1O,_25);case 13:return _1G(_1P,_25);case 14:return _1G(_1Q,_25);case 15:return _1G(_1R,_25);case 16:return _1G(_1S,_25);case 17:return _1G(_1T,_25);default:return _1G(_1U,_25);}},_26=[0,125],_27=unCStr("{handle: "),_28=function(_29,_2a,_2b,_2c,_2d,_2e){var _2f=new T(function(){var _2g=new T(function(){return _23(_2a,new T(function(){var _2h=E(_2c);return _2h[0]==0?E(_2e):_1G(_1F,new T(function(){return _1G(_2h,[1,_1E,_2e]);}));}));}),_2i=E(_2b);return _2i[0]==0?E(_2g):_1G(_2i,new T(function(){return _1G(_1D,_2g);}));}),_2j=E(_2d);if(!_2j[0]){var _2k=E(_29);if(!_2k[0]){return E(_2f);}else{var _2l=E(_2k[1]);return _2l[0]==0?_1G(_27,new T(function(){return _1G(_2l[1],[1,_26,new T(function(){return _1G(_1D,_2f);})]);})):_1G(_27,new T(function(){return _1G(_2l[1],[1,_26,new T(function(){return _1G(_1D,_2f);})]);}));}}else{return _1G(_2j[1],new T(function(){return _1G(_1D,_2f);}));}},_2m=function(_2n){var _2o=E(_2n);return _28(_2o[1],_2o[2],_2o[3],_2o[4],_2o[6],_g);},_2p=function(_2q,_2r){var _2s=E(_2q);return _28(_2s[1],_2s[2],_2s[3],_2s[4],_2s[6],_2r);},_2t=[0,44],_2u=[0,93],_2v=[0,91],_2w=function(_2x,_2y,_2z){var _2A=E(_2y);return _2A[0]==0?unAppCStr("[]",_2z):[1,_2v,new T(function(){return A(_2x,[_2A[1],new T(function(){var _2B=function(_2C){var _2D=E(_2C);return _2D[0]==0?E([1,_2u,_2z]):[1,_2t,new T(function(){return A(_2x,[_2D[1],new T(function(){return _2B(_2D[2]);})]);})];};return _2B(_2A[2]);})]);})];},_2E=function(_2F,_2G){return _2w(_2p,_2F,_2G);},_2H=function(_2I,_2J,_2K){var _2L=E(_2J);return _28(_2L[1],_2L[2],_2L[3],_2L[4],_2L[6],_2K);},_2M=[0,_2H,_2m,_2E],_2N=new T(function(){return [0,_1k,_2M,_2O,_1A];}),_2O=function(_2P){return [0,_2N,_2P];},_2Q=7,_2R=function(_2S){return [0,_9,_2Q,_g,_2S,_9,_9];},_2T=function(_2U,_){return die(new T(function(){return _2O(new T(function(){return _2R(_2U);}));}));},_2V=function(_2W,_){return _2T(_2W,_);},_2X=function(_2Y,_){return _2Y;},_2Z=[0,_1b,_18,_2X,_2V],_30=function(_31){return E(E(_31)[1]);},_32=function(_33,_34,_35,_36){return A(_30,[_33,new T(function(){return A(_34,[_36]);}),function(_37){return A(_35,[new T(function(){return E(E(_37)[1]);}),new T(function(){return E(E(_37)[2]);})]);}]);},_38=function(_39,_3a,_3b,_3c){return A(_30,[_39,new T(function(){return A(_3a,[_3c]);}),function(_3d){return A(_3b,[new T(function(){return E(E(_3d)[2]);})]);}]);},_3e=function(_3f,_3g,_3h,_3i){return _38(_3f,_3g,_3h,_3i);},_3j=function(_3k){return E(E(_3k)[4]);},_3l=function(_3m,_3n){var _3o=new T(function(){return A(_3j,[_3m,_3n]);});return function(_3p){return E(_3o);};},_3q=function(_3r){return E(E(_3r)[3]);},_3s=function(_3t){var _3u=new T(function(){return _3q(_3t);});return [0,function(_3g,_3h,_3i){return _32(_3t,_3g,_3h,_3i);},function(_3g,_3h,_3i){return _3e(_3t,_3g,_3h,_3i);},function(_3v,_3w){return A(_3u,[[0,_3v,_3w]]);},function(_3i){return _3l(_3t,_3i);}];},_3x=new T(function(){return _3s(_2Z);}),_3y=[0,112],_3z=function(_3A,_3B){var _3C=jsShowI(_3A);return _1G(fromJSStr(_3C),_3B);},_3D=[0,41],_3E=[0,40],_3F=function(_3G,_3H,_3I){return _3H>=0?_3z(_3H,_3I):_3G<=6?_3z(_3H,_3I):[1,_3E,new T(function(){var _3J=jsShowI(_3H);return _1G(fromJSStr(_3J),[1,_3D,_3I]);})];},_3K=function(_3L,_3M,_3N,_3O){var _3P=E(_3M);return A(_3P[1],[new T(function(){var _3Q=E(_3L);return E(_3N);}),function(_3R){var _3S=new T(function(){return E(E(_3R)[2]);});return A(_3P[2],[new T(function(){return A(_3O,[new T(function(){var _3T=E(new T(function(){var _3U=E(_3L);return [0,coercionToken];})),_3V=E(_3R);return [0,_3V[1],new T(function(){return [0,E(_3S)[1]+1|0];}),_3V[3],_3V[4],_3V[5],_3V[6]];})]);}),new T(function(){return A(_3P[3],[[1,_3y,new T(function(){return _1G(_3F(0,E(_3S)[1],_g),new T(function(){return E(E(_3R)[1]);}));})]]);})]);}]);},_3W=new T(function(){return _3K(_13,_3x,_11,_Y);}),_3X=unCStr("span"),_3Y=function(_3Z,_40,_){var _41=jsCreateElem(toJSStr(E(_3Z))),_42=jsAppendChild(_41,E(_40)[1]);return [0,_41];},_43=function(_X,_){return _3Y(_3X,_X,_);},_44=unCStr(" could be found!"),_45=function(_46){return err(unAppCStr("No element with ID ",new T(function(){return _1G(_46,_44);})));},_47=function(_48,_49,_){var _4a=E(_49),_4b=jsFind(toJSStr(_4a)),_4c=E(_4b);if(!_4c[0]){return _45(_4a);}else{var _4d=E(_4c[1]),_4e=jsClearChildren(_4d[1]);return _l(_48,_4d,_);}},_4f=function(_4g,_4h,_4i,_){var _4j=A(_3W,[_4i,_]),_4k=E(_4j),_4l=_4k[1],_4m=E(_4k[2]),_4n=_4m[2],_4o=E(_4m[4]),_4p=A(_4g,[[0,_4m[1],_4n,_4m[3],[0,function(_){return _47(function(_4q,_){var _4r=A(_4g,[new T(function(){var _4s=E(_4q);return [0,_4s[1],_4n,_4s[3],_4s[4],_4s[5],_4s[6]];}),_]);return [0,[0,_2X,E(E(_4r)[1])[2]],_4q];},_4l,_);},function(_4t,_){var _4u=_47(new T(function(){return A(_4h,[_4t]);}),_4l,_),_4v=E(_4u);return _4v[0]==0?_9:A(_4o[2],[_4v[1],_]);}],_4m[5],_4m[6]],_]),_4w=E(_4p),_4x=_4w[2],_4y=E(_4w[1]),_4z=_4y[1],_4A=new T(function(){return _Q(_43,[1,[0,_z,_4l],_g]);}),_4B=E(_4y[2]);if(!_4B[0]){return [0,[0,function(_4C,_){var _4D=A(_4z,[_4C,_]),_4E=A(_4A,[_4C,_]);return _4C;},_9],new T(function(){var _4F=E(_4x);return [0,_4F[1],_4F[2],_4F[3],_4o,_4F[5],_4F[6]];})];}else{var _4G=A(_4h,[_4B[1],new T(function(){var _4H=E(_4x);return [0,_4H[1],_4H[2],_4H[3],_4o,_4H[5],_4H[6]];}),_]),_4I=E(_4G),_4J=E(_4I[1]);return [0,[0,function(_4K,_){var _4L=A(_4z,[_4K,_]),_4M=A(_4A,[_4K,_]),_4N=A(_4J[1],[_4M,_]);return _4K;},_4J[2]],_4I[2]];}},_4O=unCStr("padding:15px;border-style:dotted"),_4P=unCStr("border-collapse:collapse"),_4Q=unCStr("vertical-align:top"),_4R=[0,3],_4S=function(_4T,_4U,_){var _4V=jsCreateTextNode(toJSStr(E(_4T))),_4W=jsAppendChild(_4V,E(_4U)[1]);return [0,_4V];},_4X=[0,112],_4Y=[1,_4X,_g],_4Z=function(_50,_51){var _52=new T(function(){return A(_50,[_51]);});return function(_53,_){var _54=jsCreateElem(toJSStr(_4Y)),_55=jsAppendChild(_54,E(_53)[1]),_56=[0,_54],_57=A(_52,[_56,_]);return _56;};},_58=function(_59){return _3F(0,E(_59)[1],_g);},_5a=[0,98],_5b=[1,_5a,_g],_5c=function(_5d,_5e){var _5f=new T(function(){return A(_5d,[_5e]);});return function(_5g,_){var _5h=jsCreateElem(toJSStr(_5b)),_5i=jsAppendChild(_5h,E(_5g)[1]),_5j=[0,_5h],_5k=A(_5f,[_5j,_]);return _5j;};},_5l=unCStr("br"),_5m=function(_5n,_){var _5o=jsCreateElem(toJSStr(E(_5l))),_5p=jsAppendChild(_5o,E(_5n)[1]);return [0,_5o];},_5q=[1,_A],_5r=unCStr("result: "),_5s=function(_5t){var _5u=new T(function(){return _5c(_4S,new T(function(){return _58(_5t);}));});return function(_5v,_){return [0,[0,function(_5w,_){var _5x=_5m(_5w,_),_5y=_4S(_5r,_5w,_),_5z=A(_5u,[_5w,_]);return _5w;},_5q],_5v];};},_5A=unCStr(" numbers and append the result using a fold"),_5B=[0,0],_5C=[1,_5B],_5D=[0,_2X,_5C],_5E=function(_5F,_){return [0,_5D,_5F];},_5G=function(_5H,_5I,_5J,_){var _5K=_3Y(_5H,_5J,_),_5L=A(_5I,[_5K,_]);return _5K;},_5M=unCStr("()"),_5N=unCStr("GHC.Tuple"),_5O=unCStr("ghc-prim"),_5P=[0,I_fromBits([2170319554,3688774321]),I_fromBits([26914641,3196943984]),_5O,_5N,_5M],_5Q=[0,I_fromBits([2170319554,3688774321]),I_fromBits([26914641,3196943984]),_5P,_g],_5R=function(_5S){return E(_5Q);},_5T=unCStr("haste-perch-0.1.0.1"),_5U=unCStr("Haste.Perch"),_5V=unCStr("PerchM"),_5W=[0,I_fromBits([2701112155,1279447594]),I_fromBits([4004215588,1086752342]),_5T,_5U,_5V],_5X=[0,I_fromBits([2701112155,1279447594]),I_fromBits([4004215588,1086752342]),_5W,_g],_5Y=function(_5Z){return E(_5X);},_60=function(_61){var _62=E(_61);return _62[0]==0?[0]:_1G(_62[1],new T(function(){return _60(_62[2]);}));},_63=function(_64,_65){var _66=E(_64);if(!_66){return [0,_g,_65];}else{var _67=E(_65);if(!_67[0]){return [0,_g,_g];}else{var _68=new T(function(){var _69=_63(_66-1|0,_67[2]);return [0,_69[1],_69[2]];});return [0,[1,_67[1],new T(function(){return E(E(_68)[1]);})],new T(function(){return E(E(_68)[2]);})];}}},_6a=[0,120],_6b=[0,48],_6c=function(_6d){var _6e=new T(function(){var _6f=_63(8,new T(function(){var _6g=md5(toJSStr(E(_6d)));return fromJSStr(_6g);}));return [0,_6f[1],_6f[2]];}),_6h=parseInt([0,toJSStr([1,_6b,[1,_6a,new T(function(){return E(E(_6e)[1]);})]])]),_6i=new T(function(){var _6j=_63(8,new T(function(){return E(E(_6e)[2]);}));return [0,_6j[1],_6j[2]];}),_6k=parseInt([0,toJSStr([1,_6b,[1,_6a,new T(function(){return E(E(_6i)[1]);})]])]),_6l=hs_mkWord64(_6h,_6k),_6m=parseInt([0,toJSStr([1,_6b,[1,_6a,new T(function(){return E(_63(8,new T(function(){return E(E(_6i)[2]);}))[1]);})]])]),_6n=hs_mkWord64(_6m,_6m);return [0,_6l,_6n];},_6o=function(_6p,_6q){var _6r=E(_6q);return _6r[0]==0?[0]:[1,new T(function(){return A(_6p,[_6r[1]]);}),new T(function(){return _6o(_6p,_6r[2]);})];},_6s=function(_6t,_6u){var _6v=jsShowI(_6t),_6w=md5(_6v);return _1G(fromJSStr(_6w),new T(function(){var _6x=jsShowI(_6u),_6y=md5(_6x);return fromJSStr(_6y);}));},_6z=function(_6A){var _6B=E(_6A);return _6s(_6B[1],_6B[2]);},_6C=function(_6D){var _6E=E(_6D);if(!_6E[0]){return [0];}else{var _6F=E(_6E[1]);return [1,[0,_6F[1],_6F[2]],new T(function(){return _6C(_6E[2]);})];}},_6G=unCStr("Prelude.undefined"),_6H=new T(function(){return err(_6G);}),_6I=function(_6J,_6K){return function(_6L){return E(new T(function(){var _6M=A(_6J,[_6H]),_6N=E(_6M[3]),_6O=_6N[1],_6P=_6N[2],_6Q=_1G(_6M[4],[1,new T(function(){return A(_6K,[_6H]);}),_g]);if(!_6Q[0]){return [0,_6O,_6P,_6N,_g];}else{var _6R=_6c(new T(function(){return _60(_6o(_6z,[1,[0,_6O,_6P],new T(function(){return _6C(_6Q);})]));}));return [0,_6R[1],_6R[2],_6N,_6Q];}}));};},_6S=new T(function(){return _6I(_5Y,_5R);}),_6T=unCStr("value"),_6U=unCStr("onclick"),_6V=unCStr("checked"),_6W=[0,_6V,_g],_6X=[1,_6W,_g],_6Y=unCStr("type"),_6Z=unCStr("input"),_70=function(_71,_){return _3Y(_6Z,_71,_);},_72=function(_73,_74,_75,_76,_77){var _78=new T(function(){var _79=new T(function(){return _Q(_70,[1,[0,_6Y,_74],[1,[0,_z,_73],[1,[0,_6T,_75],_g]]]);});return !E(_76)?E(_79):_Q(_79,_6X);}),_7a=E(_77);return _7a[0]==0?E(_78):_Q(_78,[1,[0,_6U,_7a[1]],_g]);},_7b=unCStr("href"),_7c=[0,97],_7d=[1,_7c,_g],_7e=function(_7f,_){return _3Y(_7d,_7f,_);},_7g=function(_7h,_7i){var _7j=new T(function(){return _Q(_7e,[1,[0,_7b,_7h],_g]);});return function(_7k,_){var _7l=A(_7j,[_7k,_]),_7m=A(_7i,[_7l,_]);return _7l;};},_7n=function(_7o){return _7g(_7o,function(_X,_){return _4S(_7o,_X,_);});},_7p=unCStr("option"),_7q=function(_7r,_){return _3Y(_7p,_7r,_);},_7s=unCStr("selected"),_7t=[0,_7s,_g],_7u=[1,_7t,_g],_7v=function(_7w,_7x,_7y){var _7z=new T(function(){return _Q(_7q,[1,[0,_6T,_7w],_g]);}),_7A=function(_7B,_){var _7C=A(_7z,[_7B,_]),_7D=A(_7x,[_7C,_]);return _7C;};return !E(_7y)?E(_7A):_Q(_7A,_7u);},_7E=function(_7F,_7G){return _7v(_7F,function(_X,_){return _4S(_7F,_X,_);},_7G);},_7H=unCStr("method"),_7I=unCStr("action"),_7J=unCStr("UTF-8"),_7K=unCStr("acceptCharset"),_7L=[0,_7K,_7J],_7M=unCStr("form"),_7N=function(_7O,_){return _3Y(_7M,_7O,_);},_7P=function(_7Q,_7R,_7S){var _7T=new T(function(){return _Q(_7N,[1,_7L,[1,[0,_7I,_7Q],[1,[0,_7H,_7R],_g]]]);});return function(_7U,_){var _7V=A(_7T,[_7U,_]),_7W=A(_7S,[_7V,_]);return _7V;};},_7X=unCStr("select"),_7Y=function(_7Z,_){return _3Y(_7X,_7Z,_);},_80=function(_81,_82){var _83=new T(function(){return _Q(_7Y,[1,[0,_z,_81],_g]);});return function(_84,_){var _85=A(_83,[_84,_]),_86=A(_82,[_85,_]);return _85;};},_87=unCStr("textarea"),_88=function(_89,_){return _3Y(_87,_89,_);},_8a=function(_8b,_8c){var _8d=new T(function(){return _Q(_88,[1,[0,_z,_8b],_g]);});return function(_8e,_){var _8f=A(_8d,[_8e,_]),_8g=_4S(_8c,_8f,_);return _8f;};},_8h=unCStr("color:red"),_8i=unCStr("style"),_8j=[0,_8i,_8h],_8k=[1,_8j,_g],_8l=[0,98],_8m=[1,_8l,_g],_8n=function(_8o){return _Q(function(_8p,_){var _8q=_3Y(_8m,_8p,_),_8r=A(_8o,[_8q,_]);return _8q;},_8k);},_8s=function(_8t,_8u,_){var _8v=E(_8t);if(!_8v[0]){return _8u;}else{var _8w=A(_8v[1],[_8u,_]),_8x=_8s(_8v[2],_8u,_);return _8u;}},_8y=function(_8z,_8A,_8B,_){var _8C=A(_8z,[_8B,_]),_8D=A(_8A,[_8B,_]);return _8B;},_8E=[0,_2X,_8y,_8s],_8F=[0,_8E,_6S,_4S,_4S,_5G,_8n,_7g,_7n,_72,_8a,_80,_7v,_7E,_7P,_Q],_8G=function(_8H,_8I,_){var _8J=A(_8I,[_]);return _8H;},_8K=function(_8L,_8M,_){var _8N=A(_8M,[_]);return new T(function(){return A(_8L,[_8N]);});},_8O=[0,_8K,_8G],_8P=function(_8Q){var _8R=E(_8Q);return _8R[0]==0?0:E(_8R[1])[1]+_8P(_8R[2])|0;},_8S=function(_8T){return [0,_8P(_8T)];},_8U=function(_8V,_8W){return [0,E(_8V)[1]+E(_8W)[1]|0];},_8X=[0,_5B,_8U,_8S],_8Y=function(_8Z,_90){var _91=E(_90);return _91[0]==0?[0]:[1,new T(function(){return A(_8Z,[_91[1]]);})];},_92=function(_93){return E(E(_93)[1]);},_94=function(_95){return E(E(_95)[2]);},_96=function(_97,_98,_99,_9a,_9b,_9c){var _9d=new T(function(){return _94(_97);});return A(_98,[new T(function(){return A(_9a,[_9c]);}),function(_9e){var _9f=E(_9e),_9g=E(_9f[1]);return A(_98,[new T(function(){return A(_9b,[_9f[2]]);}),function(_9h){var _9i=E(_9h),_9j=E(_9i[1]);return A(_99,[[0,[0,new T(function(){return A(_9d,[_9g[1],_9j[1]]);}),new T(function(){var _9k=E(_9g[2]);if(!_9k[0]){return [0];}else{var _9l=E(_9j[2]);return _9l[0]==0?[0]:[1,new T(function(){return A(_9k[1],[_9l[1]]);})];}})],_9i[2]]]);}]);}]);},_9m=function(_9n){return E(E(_9n)[1]);},_9o=function(_9p,_9q,_9r,_9s,_9t,_9u){var _9v=new T(function(){return _92(_9p);});return function(_9w){var _9x=E(_9q);return _96(_9v,_9x[1],_9x[3],function(_9y){return A(new T(function(){var _9z=new T(function(){return _94(_9s);});return A(_9m,[_9r,function(_9A){return [0,new T(function(){var _9B=E(E(_9A)[1]);return [0,_9B[1],new T(function(){return _8Y(_9z,_9B[2]);})];}),new T(function(){return E(E(_9A)[2]);})];}]);}),[new T(function(){return A(_9t,[_9y]);})]);},_9u,_9w);};},_9C=function(_9D,_9E){while(1){var _9F=(function(_9G,_9H){var _9I=E(_9H);if(!_9I[0]){return E(_9G);}else{_9D=new T(function(){return _9o(_8F,_2Z,_8O,_8X,_9G,_9I[1]);});_9E=_9I[2];return null;}})(_9D,_9E);if(_9F!=null){return _9F;}}},_9J=[13,coercionToken],_9K=unCStr("text"),_9L=[0,_2Z,_H],_9M=unCStr("base"),_9N=unCStr("Control.Exception.Base"),_9O=unCStr("PatternMatchFail"),_9P=[0,I_fromBits([18445595,3739165398]),I_fromBits([52003073,3246954884]),_9M,_9N,_9O],_9Q=[0,I_fromBits([18445595,3739165398]),I_fromBits([52003073,3246954884]),_9P,_g],_9R=function(_9S){return E(_9Q);},_9T=function(_9U){var _9V=E(_9U);return _1q(_1m(_9V[1]),_9R,_9V[2]);},_9W=function(_9X){return E(E(_9X)[1]);},_9Y=function(_9Z,_a0){return _1G(E(_9Z)[1],_a0);},_a1=function(_a2,_a3){return _2w(_9Y,_a2,_a3);},_a4=function(_a5,_a6,_a7){return _1G(E(_a6)[1],_a7);},_a8=[0,_a4,_9W,_a1],_a9=new T(function(){return [0,_9R,_a8,_aa,_9T];}),_aa=function(_ab){return [0,_a9,_ab];},_ac=unCStr("Non-exhaustive patterns in"),_ad=function(_ae,_af){return die(new T(function(){return A(_af,[_ae]);}));},_ag=function(_ah,_ai){var _aj=E(_ai);if(!_aj[0]){return [0,_g,_g];}else{var _ak=_aj[1];if(!A(_ah,[_ak])){return [0,_g,_aj];}else{var _al=new T(function(){var _am=_ag(_ah,_aj[2]);return [0,_am[1],_am[2]];});return [0,[1,_ak,new T(function(){return E(E(_al)[1]);})],new T(function(){return E(E(_al)[2]);})];}}},_an=[0,32],_ao=[0,10],_ap=[1,_ao,_g],_aq=function(_ar){return E(E(_ar)[1])==124?false:true;},_as=function(_at,_au){var _av=_ag(_aq,unCStr(_at)),_aw=_av[1],_ax=function(_ay,_az){return _1G(_ay,new T(function(){return unAppCStr(": ",new T(function(){return _1G(_au,new T(function(){return _1G(_az,_ap);}));}));}));},_aA=E(_av[2]);return _aA[0]==0?_ax(_aw,_g):E(E(_aA[1])[1])==124?_ax(_aw,[1,_an,_aA[2]]):_ax(_aw,_g);},_aB=function(_aC){return _ad([0,new T(function(){return _as(_aC,_ac);})],_aa);},_aD=new T(function(){return _aB("Text\\ParserCombinators\\ReadP.hs:(134,3)-(157,60)|function mplus");}),_aE=function(_aF,_aG){while(1){var _aH=(function(_aI,_aJ){var _aK=E(_aI);switch(_aK[0]){case 0:var _aL=E(_aJ);if(!_aL[0]){return [0];}else{_aF=A(_aK[1],[_aL[1]]);_aG=_aL[2];return null;}break;case 1:var _aM=A(_aK[1],[_aJ]),_aN=_aJ;_aF=_aM;_aG=_aN;return null;case 2:return [0];case 3:return [1,[0,_aK[1],_aJ],new T(function(){return _aE(_aK[2],_aJ);})];default:return E(_aK[1]);}})(_aF,_aG);if(_aH!=null){return _aH;}}},_aO=function(_aP,_aQ){var _aR=new T(function(){var _aS=E(_aQ);if(_aS[0]==3){return [3,_aS[1],new T(function(){return _aO(_aP,_aS[2]);})];}else{var _aT=E(_aP);if(_aT[0]==2){return E(_aS);}else{var _aU=E(_aS);if(_aU[0]==2){return E(_aT);}else{var _aV=new T(function(){var _aW=E(_aU);if(_aW[0]==4){return [1,function(_aX){return [4,new T(function(){return _1G(_aE(_aT,_aX),_aW[1]);})];}];}else{var _aY=E(_aT);if(_aY[0]==1){var _aZ=_aY[1],_b0=E(_aW);return _b0[0]==0?[1,function(_b1){return _aO(A(_aZ,[_b1]),_b0);}]:[1,function(_b2){return _aO(A(_aZ,[_b2]),new T(function(){return A(_b0[1],[_b2]);}));}];}else{var _b3=E(_aW);return _b3[0]==0?E(_aD):[1,function(_b4){return _aO(_aY,new T(function(){return A(_b3[1],[_b4]);}));}];}}}),_b5=E(_aT);switch(_b5[0]){case 1:var _b6=E(_aU);return _b6[0]==4?[1,function(_b7){return [4,new T(function(){return _1G(_aE(A(_b5[1],[_b7]),_b7),_b6[1]);})];}]:E(_aV);case 4:var _b8=_b5[1],_b9=E(_aU);switch(_b9[0]){case 0:return [1,function(_ba){return [4,new T(function(){return _1G(_b8,new T(function(){return _aE(_b9,_ba);}));})];}];case 1:return [1,function(_bb){return [4,new T(function(){return _1G(_b8,new T(function(){return _aE(A(_b9[1],[_bb]),_bb);}));})];}];default:return [4,new T(function(){return _1G(_b8,_b9[1]);})];}break;default:return E(_aV);}}}}}),_bc=E(_aP);switch(_bc[0]){case 0:var _bd=E(_aQ);return _bd[0]==0?[0,function(_be){return _aO(A(_bc[1],[_be]),new T(function(){return A(_bd[1],[_be]);}));}]:E(_aR);case 3:return [3,_bc[1],new T(function(){return _aO(_bc[2],_aQ);})];default:return E(_aR);}},_bf=function(_bg,_bh){return E(_bg)[1]!=E(_bh)[1];},_bi=function(_bj,_bk){return E(_bj)[1]==E(_bk)[1];},_bl=[0,_bi,_bf],_bm=function(_bn){return E(E(_bn)[1]);},_bo=function(_bp,_bq,_br){while(1){var _bs=E(_bq);if(!_bs[0]){return E(_br)[0]==0?true:false;}else{var _bt=E(_br);if(!_bt[0]){return false;}else{if(!A(_bm,[_bp,_bs[1],_bt[1]])){return false;}else{_bq=_bs[2];_br=_bt[2];continue;}}}}},_bu=function(_bv,_bw,_bx){return !_bo(_bv,_bw,_bx)?true:false;},_by=function(_bz){return [0,function(_bA,_bB){return _bo(_bz,_bA,_bB);},function(_bA,_bB){return _bu(_bz,_bA,_bB);}];},_bC=new T(function(){return _by(_bl);}),_bD=function(_bE,_bF){var _bG=E(_bE);switch(_bG[0]){case 0:return [0,function(_bH){return _bD(A(_bG[1],[_bH]),_bF);}];case 1:return [1,function(_bI){return _bD(A(_bG[1],[_bI]),_bF);}];case 2:return [2];case 3:return _aO(A(_bF,[_bG[1]]),new T(function(){return _bD(_bG[2],_bF);}));default:var _bJ=function(_bK){var _bL=E(_bK);if(!_bL[0]){return [0];}else{var _bM=E(_bL[1]);return _1G(_aE(A(_bF,[_bM[1]]),_bM[2]),new T(function(){return _bJ(_bL[2]);}));}},_bN=_bJ(_bG[1]);return _bN[0]==0?[2]:[4,_bN];}},_bO=[2],_bP=function(_bQ){return [3,_bQ,_bO];},_bR=function(_bS,_bT){var _bU=E(_bS);if(!_bU){return A(_bT,[_A]);}else{var _bV=new T(function(){return _bR(_bU-1|0,_bT);});return [0,function(_bW){return E(_bV);}];}},_bX=function(_bY,_bZ,_c0){var _c1=new T(function(){return A(_bY,[_bP]);});return [1,function(_c2){return A(function(_c3,_c4,_c5){while(1){var _c6=(function(_c7,_c8,_c9){var _ca=E(_c7);switch(_ca[0]){case 0:var _cb=E(_c8);if(!_cb[0]){return E(_bZ);}else{_c3=A(_ca[1],[_cb[1]]);_c4=_cb[2];var _cc=_c9+1|0;_c5=_cc;return null;}break;case 1:var _cd=A(_ca[1],[_c8]),_ce=_c8,_cc=_c9;_c3=_cd;_c4=_ce;_c5=_cc;return null;case 2:return E(_bZ);case 3:return function(_cf){var _cg=new T(function(){return _bD(_ca,_cf);});return _bR(_c9,function(_ch){return E(_cg);});};default:return function(_ci){return _bD(_ca,_ci);};}})(_c3,_c4,_c5);if(_c6!=null){return _c6;}}},[_c1,_c2,0,_c0]);}];},_cj=[6],_ck=unCStr("valDig: Bad base"),_cl=new T(function(){return err(_ck);}),_cm=function(_cn,_co){var _cp=function(_cq,_cr){var _cs=E(_cq);if(!_cs[0]){var _ct=new T(function(){return A(_cr,[_g]);});return function(_cu){return A(_cu,[_ct]);};}else{var _cv=E(_cs[1])[1],_cw=function(_cx){var _cy=new T(function(){return _cp(_cs[2],function(_cz){return A(_cr,[[1,_cx,_cz]]);});});return function(_cA){var _cB=new T(function(){return A(_cy,[_cA]);});return [0,function(_cC){return E(_cB);}];};};switch(E(E(_cn)[1])){case 8:if(48>_cv){var _cD=new T(function(){return A(_cr,[_g]);});return function(_cE){return A(_cE,[_cD]);};}else{if(_cv>55){var _cF=new T(function(){return A(_cr,[_g]);});return function(_cG){return A(_cG,[_cF]);};}else{return _cw([0,_cv-48|0]);}}break;case 10:if(48>_cv){var _cH=new T(function(){return A(_cr,[_g]);});return function(_cI){return A(_cI,[_cH]);};}else{if(_cv>57){var _cJ=new T(function(){return A(_cr,[_g]);});return function(_cK){return A(_cK,[_cJ]);};}else{return _cw([0,_cv-48|0]);}}break;case 16:var _cL=new T(function(){return 97>_cv?65>_cv?[0]:_cv>70?[0]:[1,[0,(_cv-65|0)+10|0]]:_cv>102?65>_cv?[0]:_cv>70?[0]:[1,[0,(_cv-65|0)+10|0]]:[1,[0,(_cv-97|0)+10|0]];});if(48>_cv){var _cM=E(_cL);if(!_cM[0]){var _cN=new T(function(){return A(_cr,[_g]);});return function(_cO){return A(_cO,[_cN]);};}else{return _cw(_cM[1]);}}else{if(_cv>57){var _cP=E(_cL);if(!_cP[0]){var _cQ=new T(function(){return A(_cr,[_g]);});return function(_cR){return A(_cR,[_cQ]);};}else{return _cw(_cP[1]);}}else{return _cw([0,_cv-48|0]);}}break;default:return E(_cl);}}};return [1,function(_cS){return A(_cp,[_cS,_H,function(_cT){var _cU=E(_cT);return _cU[0]==0?[2]:A(_co,[_cU]);}]);}];},_cV=[0,10],_cW=[0,1],_cX=[0,2147483647],_cY=function(_cZ,_d0){while(1){var _d1=E(_cZ);if(!_d1[0]){var _d2=_d1[1],_d3=E(_d0);if(!_d3[0]){var _d4=_d3[1],_d5=addC(_d2,_d4);if(!E(_d5[2])){return [0,_d5[1]];}else{_cZ=[1,I_fromInt(_d2)];_d0=[1,I_fromInt(_d4)];continue;}}else{_cZ=[1,I_fromInt(_d2)];_d0=_d3;continue;}}else{var _d6=E(_d0);if(!_d6[0]){_cZ=_d1;_d0=[1,I_fromInt(_d6[1])];continue;}else{return [1,I_add(_d1[1],_d6[1])];}}}},_d7=new T(function(){return _cY(_cX,_cW);}),_d8=function(_d9){var _da=E(_d9);if(!_da[0]){var _db=E(_da[1]);return _db==(-2147483648)?E(_d7):[0, -_db];}else{return [1,I_negate(_da[1])];}},_dc=[0,10],_dd=[0,0],_de=function(_df,_dg){while(1){var _dh=E(_df);if(!_dh[0]){var _di=_dh[1],_dj=E(_dg);if(!_dj[0]){var _dk=_dj[1];if(!(imul(_di,_dk)|0)){return [0,imul(_di,_dk)|0];}else{_df=[1,I_fromInt(_di)];_dg=[1,I_fromInt(_dk)];continue;}}else{_df=[1,I_fromInt(_di)];_dg=_dj;continue;}}else{var _dl=E(_dg);if(!_dl[0]){_df=_dh;_dg=[1,I_fromInt(_dl[1])];continue;}else{return [1,I_mul(_dh[1],_dl[1])];}}}},_dm=function(_dn,_do,_dp){while(1){var _dq=E(_dp);if(!_dq[0]){return E(_do);}else{var _dr=_cY(_de(_do,_dn),_dq[1]);_dp=_dq[2];_do=_dr;continue;}}},_ds=function(_dt){var _du=new T(function(){return _aO(_aO([0,function(_dv){return E(E(_dv)[1])==45?_cm(_cV,function(_dw){return A(_dt,[[1,new T(function(){return _d8(_dm(_dc,_dd,_dw));})]]);}):[2];}],[0,function(_dx){return E(E(_dx)[1])==43?_cm(_cV,function(_dy){return A(_dt,[[1,new T(function(){return _dm(_dc,_dd,_dy);})]]);}):[2];}]),new T(function(){return _cm(_cV,function(_dz){return A(_dt,[[1,new T(function(){return _dm(_dc,_dd,_dz);})]]);});}));});return _aO([0,function(_dA){return E(E(_dA)[1])==101?E(_du):[2];}],[0,function(_dB){return E(E(_dB)[1])==69?E(_du):[2];}]);},_dC=function(_dD){return A(_dD,[_9]);},_dE=function(_dF){return A(_dF,[_9]);},_dG=function(_dH){var _dI=new T(function(){return _cm(_cV,function(_dJ){return A(_dH,[[1,_dJ]]);});});return [0,function(_dK){return E(E(_dK)[1])==46?E(_dI):[2];}];},_dL=function(_dM){return _cm(_cV,function(_dN){return _bX(_dG,_dC,function(_dO){return _bX(_ds,_dE,function(_dP){return A(_dM,[[5,[1,_dN,_dO,_dP]]]);});});});},_dQ=function(_dR,_dS,_dT){while(1){var _dU=E(_dT);if(!_dU[0]){return false;}else{if(!A(_bm,[_dR,_dS,_dU[1]])){_dT=_dU[2];continue;}else{return true;}}}},_dV=unCStr("!@#$%&*+./<=>?\\^|:-~"),_dW=function(_dX){return _dQ(_bl,_dX,_dV);},_dY=[0,8],_dZ=[0,16],_e0=function(_e1){var _e2=new T(function(){return _cm(_dZ,function(_e3){return A(_e1,[[5,[0,_dZ,_e3]]]);});}),_e4=new T(function(){return _cm(_dY,function(_e5){return A(_e1,[[5,[0,_dY,_e5]]]);});}),_e6=new T(function(){return _cm(_dZ,function(_e7){return A(_e1,[[5,[0,_dZ,_e7]]]);});}),_e8=new T(function(){return _cm(_dY,function(_e9){return A(_e1,[[5,[0,_dY,_e9]]]);});});return [0,function(_ea){return E(E(_ea)[1])==48?E([0,function(_eb){switch(E(E(_eb)[1])){case 79:return E(_e8);case 88:return E(_e6);case 111:return E(_e4);case 120:return E(_e2);default:return [2];}}]):[2];}];},_ec=true,_ed=function(_ee){var _ef=new T(function(){return A(_ee,[_dZ]);}),_eg=new T(function(){return A(_ee,[_dY]);}),_eh=new T(function(){return A(_ee,[_dZ]);}),_ei=new T(function(){return A(_ee,[_dY]);});return [0,function(_ej){switch(E(E(_ej)[1])){case 79:return E(_ei);case 88:return E(_eh);case 111:return E(_eg);case 120:return E(_ef);default:return [2];}}];},_ek=function(_el){return A(_el,[_cV]);},_em=function(_en){return err(unAppCStr("Prelude.chr: bad argument: ",new T(function(){return _3F(9,_en,_g);})));},_eo=function(_ep){var _eq=E(_ep);return _eq[0]==0?E(_eq[1]):I_toInt(_eq[1]);},_er=function(_es,_et){var _eu=E(_es);if(!_eu[0]){var _ev=_eu[1],_ew=E(_et);return _ew[0]==0?_ev<=_ew[1]:I_compareInt(_ew[1],_ev)>=0;}else{var _ex=_eu[1],_ey=E(_et);return _ey[0]==0?I_compareInt(_ex,_ey[1])<=0:I_compare(_ex,_ey[1])<=0;}},_ez=function(_eA){return [2];},_eB=function(_eC){var _eD=E(_eC);if(!_eD[0]){return E(_ez);}else{var _eE=_eD[1],_eF=E(_eD[2]);if(!_eF[0]){return E(_eE);}else{var _eG=new T(function(){return _eB(_eF);});return function(_eH){return _aO(A(_eE,[_eH]),new T(function(){return A(_eG,[_eH]);}));};}}},_eI=unCStr("NUL"),_eJ=function(_eK){return [2];},_eL=function(_eM){return _eJ(_eM);},_eN=function(_eO,_eP){var _eQ=function(_eR,_eS){var _eT=E(_eR);if(!_eT[0]){return function(_eU){return A(_eU,[_eO]);};}else{var _eV=E(_eS);if(!_eV[0]){return E(_eJ);}else{if(E(_eT[1])[1]!=E(_eV[1])[1]){return E(_eL);}else{var _eW=new T(function(){return _eQ(_eT[2],_eV[2]);});return function(_eX){var _eY=new T(function(){return A(_eW,[_eX]);});return [0,function(_eZ){return E(_eY);}];};}}}};return [1,function(_f0){return A(_eQ,[_eO,_f0,_eP]);}];},_f1=[0,0],_f2=function(_f3){var _f4=new T(function(){return A(_f3,[_f1]);});return _eN(_eI,function(_f5){return E(_f4);});},_f6=unCStr("STX"),_f7=[0,2],_f8=function(_f9){var _fa=new T(function(){return A(_f9,[_f7]);});return _eN(_f6,function(_fb){return E(_fa);});},_fc=unCStr("ETX"),_fd=[0,3],_fe=function(_ff){var _fg=new T(function(){return A(_ff,[_fd]);});return _eN(_fc,function(_fh){return E(_fg);});},_fi=unCStr("EOT"),_fj=[0,4],_fk=function(_fl){var _fm=new T(function(){return A(_fl,[_fj]);});return _eN(_fi,function(_fn){return E(_fm);});},_fo=unCStr("ENQ"),_fp=[0,5],_fq=function(_fr){var _fs=new T(function(){return A(_fr,[_fp]);});return _eN(_fo,function(_ft){return E(_fs);});},_fu=unCStr("ACK"),_fv=[0,6],_fw=function(_fx){var _fy=new T(function(){return A(_fx,[_fv]);});return _eN(_fu,function(_fz){return E(_fy);});},_fA=unCStr("BEL"),_fB=[0,7],_fC=function(_fD){var _fE=new T(function(){return A(_fD,[_fB]);});return _eN(_fA,function(_fF){return E(_fE);});},_fG=unCStr("BS"),_fH=[0,8],_fI=function(_fJ){var _fK=new T(function(){return A(_fJ,[_fH]);});return _eN(_fG,function(_fL){return E(_fK);});},_fM=unCStr("HT"),_fN=[0,9],_fO=function(_fP){var _fQ=new T(function(){return A(_fP,[_fN]);});return _eN(_fM,function(_fR){return E(_fQ);});},_fS=unCStr("LF"),_fT=[0,10],_fU=function(_fV){var _fW=new T(function(){return A(_fV,[_fT]);});return _eN(_fS,function(_fX){return E(_fW);});},_fY=unCStr("VT"),_fZ=[0,11],_g0=function(_g1){var _g2=new T(function(){return A(_g1,[_fZ]);});return _eN(_fY,function(_g3){return E(_g2);});},_g4=unCStr("FF"),_g5=[0,12],_g6=function(_g7){var _g8=new T(function(){return A(_g7,[_g5]);});return _eN(_g4,function(_g9){return E(_g8);});},_ga=unCStr("CR"),_gb=[0,13],_gc=function(_gd){var _ge=new T(function(){return A(_gd,[_gb]);});return _eN(_ga,function(_gf){return E(_ge);});},_gg=unCStr("SI"),_gh=[0,15],_gi=function(_gj){var _gk=new T(function(){return A(_gj,[_gh]);});return _eN(_gg,function(_gl){return E(_gk);});},_gm=unCStr("DLE"),_gn=[0,16],_go=function(_gp){var _gq=new T(function(){return A(_gp,[_gn]);});return _eN(_gm,function(_gr){return E(_gq);});},_gs=unCStr("DC1"),_gt=[0,17],_gu=function(_gv){var _gw=new T(function(){return A(_gv,[_gt]);});return _eN(_gs,function(_gx){return E(_gw);});},_gy=unCStr("DC2"),_gz=[0,18],_gA=function(_gB){var _gC=new T(function(){return A(_gB,[_gz]);});return _eN(_gy,function(_gD){return E(_gC);});},_gE=unCStr("DC3"),_gF=[0,19],_gG=function(_gH){var _gI=new T(function(){return A(_gH,[_gF]);});return _eN(_gE,function(_gJ){return E(_gI);});},_gK=unCStr("DC4"),_gL=[0,20],_gM=function(_gN){var _gO=new T(function(){return A(_gN,[_gL]);});return _eN(_gK,function(_gP){return E(_gO);});},_gQ=unCStr("NAK"),_gR=[0,21],_gS=function(_gT){var _gU=new T(function(){return A(_gT,[_gR]);});return _eN(_gQ,function(_gV){return E(_gU);});},_gW=unCStr("SYN"),_gX=[0,22],_gY=function(_gZ){var _h0=new T(function(){return A(_gZ,[_gX]);});return _eN(_gW,function(_h1){return E(_h0);});},_h2=unCStr("ETB"),_h3=[0,23],_h4=function(_h5){var _h6=new T(function(){return A(_h5,[_h3]);});return _eN(_h2,function(_h7){return E(_h6);});},_h8=unCStr("CAN"),_h9=[0,24],_ha=function(_hb){var _hc=new T(function(){return A(_hb,[_h9]);});return _eN(_h8,function(_hd){return E(_hc);});},_he=unCStr("EM"),_hf=[0,25],_hg=function(_hh){var _hi=new T(function(){return A(_hh,[_hf]);});return _eN(_he,function(_hj){return E(_hi);});},_hk=unCStr("SUB"),_hl=[0,26],_hm=function(_hn){var _ho=new T(function(){return A(_hn,[_hl]);});return _eN(_hk,function(_hp){return E(_ho);});},_hq=unCStr("ESC"),_hr=[0,27],_hs=function(_ht){var _hu=new T(function(){return A(_ht,[_hr]);});return _eN(_hq,function(_hv){return E(_hu);});},_hw=unCStr("FS"),_hx=[0,28],_hy=function(_hz){var _hA=new T(function(){return A(_hz,[_hx]);});return _eN(_hw,function(_hB){return E(_hA);});},_hC=unCStr("GS"),_hD=[0,29],_hE=function(_hF){var _hG=new T(function(){return A(_hF,[_hD]);});return _eN(_hC,function(_hH){return E(_hG);});},_hI=unCStr("RS"),_hJ=[0,30],_hK=function(_hL){var _hM=new T(function(){return A(_hL,[_hJ]);});return _eN(_hI,function(_hN){return E(_hM);});},_hO=unCStr("US"),_hP=[0,31],_hQ=function(_hR){var _hS=new T(function(){return A(_hR,[_hP]);});return _eN(_hO,function(_hT){return E(_hS);});},_hU=unCStr("SP"),_hV=[0,32],_hW=function(_hX){var _hY=new T(function(){return A(_hX,[_hV]);});return _eN(_hU,function(_hZ){return E(_hY);});},_i0=unCStr("DEL"),_i1=[0,127],_i2=function(_i3){var _i4=new T(function(){return A(_i3,[_i1]);});return _eN(_i0,function(_i5){return E(_i4);});},_i6=[1,_i2,_g],_i7=[1,_hW,_i6],_i8=[1,_hQ,_i7],_i9=[1,_hK,_i8],_ia=[1,_hE,_i9],_ib=[1,_hy,_ia],_ic=[1,_hs,_ib],_id=[1,_hm,_ic],_ie=[1,_hg,_id],_if=[1,_ha,_ie],_ig=[1,_h4,_if],_ih=[1,_gY,_ig],_ii=[1,_gS,_ih],_ij=[1,_gM,_ii],_ik=[1,_gG,_ij],_il=[1,_gA,_ik],_im=[1,_gu,_il],_in=[1,_go,_im],_io=[1,_gi,_in],_ip=[1,_gc,_io],_iq=[1,_g6,_ip],_ir=[1,_g0,_iq],_is=[1,_fU,_ir],_it=[1,_fO,_is],_iu=[1,_fI,_it],_iv=[1,_fC,_iu],_iw=[1,_fw,_iv],_ix=[1,_fq,_iw],_iy=[1,_fk,_ix],_iz=[1,_fe,_iy],_iA=[1,_f8,_iz],_iB=[1,_f2,_iA],_iC=unCStr("SOH"),_iD=[0,1],_iE=function(_iF){var _iG=new T(function(){return A(_iF,[_iD]);});return _eN(_iC,function(_iH){return E(_iG);});},_iI=unCStr("SO"),_iJ=[0,14],_iK=function(_iL){var _iM=new T(function(){return A(_iL,[_iJ]);});return _eN(_iI,function(_iN){return E(_iM);});},_iO=function(_iP){return _bX(_iE,_iK,_iP);},_iQ=[1,_iO,_iB],_iR=new T(function(){return _eB(_iQ);}),_iS=[0,1114111],_iT=[0,34],_iU=[0,_iT,_ec],_iV=[0,39],_iW=[0,_iV,_ec],_iX=[0,92],_iY=[0,_iX,_ec],_iZ=[0,_fB,_ec],_j0=[0,_fH,_ec],_j1=[0,_g5,_ec],_j2=[0,_fT,_ec],_j3=[0,_gb,_ec],_j4=[0,_fN,_ec],_j5=[0,_fZ,_ec],_j6=[0,_f1,_ec],_j7=[0,_iD,_ec],_j8=[0,_f7,_ec],_j9=[0,_fd,_ec],_ja=[0,_fj,_ec],_jb=[0,_fp,_ec],_jc=[0,_fv,_ec],_jd=[0,_fB,_ec],_je=[0,_fH,_ec],_jf=[0,_fN,_ec],_jg=[0,_fT,_ec],_jh=[0,_fZ,_ec],_ji=[0,_g5,_ec],_jj=[0,_gb,_ec],_jk=[0,_iJ,_ec],_jl=[0,_gh,_ec],_jm=[0,_gn,_ec],_jn=[0,_gt,_ec],_jo=[0,_gz,_ec],_jp=[0,_gF,_ec],_jq=[0,_gL,_ec],_jr=[0,_gR,_ec],_js=[0,_gX,_ec],_jt=[0,_h3,_ec],_ju=[0,_h9,_ec],_jv=[0,_hf,_ec],_jw=[0,_hl,_ec],_jx=[0,_hr,_ec],_jy=[0,_hx,_ec],_jz=[0,_hD,_ec],_jA=[0,_hJ,_ec],_jB=[0,_hP,_ec],_jC=function(_jD){return [0,_jD];},_jE=function(_jF){var _jG=new T(function(){return A(_jF,[_j5]);}),_jH=new T(function(){return A(_jF,[_j4]);}),_jI=new T(function(){return A(_jF,[_j3]);}),_jJ=new T(function(){return A(_jF,[_j2]);}),_jK=new T(function(){return A(_jF,[_j1]);}),_jL=new T(function(){return A(_jF,[_j0]);}),_jM=new T(function(){return A(_jF,[_iZ]);}),_jN=new T(function(){return A(_jF,[_iY]);}),_jO=new T(function(){return A(_jF,[_iW]);}),_jP=new T(function(){return A(_jF,[_iU]);});return _aO([0,function(_jQ){switch(E(E(_jQ)[1])){case 34:return E(_jP);case 39:return E(_jO);case 92:return E(_jN);case 97:return E(_jM);case 98:return E(_jL);case 102:return E(_jK);case 110:return E(_jJ);case 114:return E(_jI);case 116:return E(_jH);case 118:return E(_jG);default:return [2];}}],new T(function(){return _aO(_bX(_ed,_ek,function(_jR){var _jS=new T(function(){return _jC(E(_jR)[1]);});return _cm(_jR,function(_jT){var _jU=_dm(_jS,_dd,_jT);return !_er(_jU,_iS)?[2]:A(_jF,[[0,new T(function(){var _jV=_eo(_jU);return _jV>>>0>1114111?_em(_jV):[0,_jV];}),_ec]]);});}),new T(function(){var _jW=new T(function(){return A(_jF,[_jB]);}),_jX=new T(function(){return A(_jF,[_jA]);}),_jY=new T(function(){return A(_jF,[_jz]);}),_jZ=new T(function(){return A(_jF,[_jy]);}),_k0=new T(function(){return A(_jF,[_jx]);}),_k1=new T(function(){return A(_jF,[_jw]);}),_k2=new T(function(){return A(_jF,[_jv]);}),_k3=new T(function(){return A(_jF,[_ju]);}),_k4=new T(function(){return A(_jF,[_jt]);}),_k5=new T(function(){return A(_jF,[_js]);}),_k6=new T(function(){return A(_jF,[_jr]);}),_k7=new T(function(){return A(_jF,[_jq]);}),_k8=new T(function(){return A(_jF,[_jp]);}),_k9=new T(function(){return A(_jF,[_jo]);}),_ka=new T(function(){return A(_jF,[_jn]);}),_kb=new T(function(){return A(_jF,[_jm]);}),_kc=new T(function(){return A(_jF,[_jl]);}),_kd=new T(function(){return A(_jF,[_jk]);}),_ke=new T(function(){return A(_jF,[_jj]);}),_kf=new T(function(){return A(_jF,[_ji]);}),_kg=new T(function(){return A(_jF,[_jh]);}),_kh=new T(function(){return A(_jF,[_jg]);}),_ki=new T(function(){return A(_jF,[_jf]);}),_kj=new T(function(){return A(_jF,[_je]);}),_kk=new T(function(){return A(_jF,[_jd]);}),_kl=new T(function(){return A(_jF,[_jc]);}),_km=new T(function(){return A(_jF,[_jb]);}),_kn=new T(function(){return A(_jF,[_ja]);}),_ko=new T(function(){return A(_jF,[_j9]);}),_kp=new T(function(){return A(_jF,[_j8]);}),_kq=new T(function(){return A(_jF,[_j7]);}),_kr=new T(function(){return A(_jF,[_j6]);});return _aO([0,function(_ks){return E(E(_ks)[1])==94?E([0,function(_kt){switch(E(E(_kt)[1])){case 64:return E(_kr);case 65:return E(_kq);case 66:return E(_kp);case 67:return E(_ko);case 68:return E(_kn);case 69:return E(_km);case 70:return E(_kl);case 71:return E(_kk);case 72:return E(_kj);case 73:return E(_ki);case 74:return E(_kh);case 75:return E(_kg);case 76:return E(_kf);case 77:return E(_ke);case 78:return E(_kd);case 79:return E(_kc);case 80:return E(_kb);case 81:return E(_ka);case 82:return E(_k9);case 83:return E(_k8);case 84:return E(_k7);case 85:return E(_k6);case 86:return E(_k5);case 87:return E(_k4);case 88:return E(_k3);case 89:return E(_k2);case 90:return E(_k1);case 91:return E(_k0);case 92:return E(_jZ);case 93:return E(_jY);case 94:return E(_jX);case 95:return E(_jW);default:return [2];}}]):[2];}],new T(function(){return A(_iR,[function(_ku){return A(_jF,[[0,_ku,_ec]]);}]);}));}));}));},_kv=function(_kw){return A(_kw,[_A]);},_kx=function(_ky){var _kz=E(_ky);if(!_kz[0]){return E(_kv);}else{var _kA=_kz[2],_kB=E(E(_kz[1])[1]);switch(_kB){case 9:var _kC=new T(function(){return _kx(_kA);});return function(_kD){var _kE=new T(function(){return A(_kC,[_kD]);});return [0,function(_kF){return E(_kE);}];};case 10:var _kG=new T(function(){return _kx(_kA);});return function(_kH){var _kI=new T(function(){return A(_kG,[_kH]);});return [0,function(_kJ){return E(_kI);}];};case 11:var _kK=new T(function(){return _kx(_kA);});return function(_kL){var _kM=new T(function(){return A(_kK,[_kL]);});return [0,function(_kN){return E(_kM);}];};case 12:var _kO=new T(function(){return _kx(_kA);});return function(_kP){var _kQ=new T(function(){return A(_kO,[_kP]);});return [0,function(_kR){return E(_kQ);}];};case 13:var _kS=new T(function(){return _kx(_kA);});return function(_kT){var _kU=new T(function(){return A(_kS,[_kT]);});return [0,function(_kV){return E(_kU);}];};case 32:var _kW=new T(function(){return _kx(_kA);});return function(_kX){var _kY=new T(function(){return A(_kW,[_kX]);});return [0,function(_kZ){return E(_kY);}];};case 160:var _l0=new T(function(){return _kx(_kA);});return function(_l1){var _l2=new T(function(){return A(_l0,[_l1]);});return [0,function(_l3){return E(_l2);}];};default:var _l4=u_iswspace(_kB);if(!E(_l4)){return E(_kv);}else{var _l5=new T(function(){return _kx(_kA);});return function(_l6){var _l7=new T(function(){return A(_l5,[_l6]);});return [0,function(_l8){return E(_l7);}];};}}}},_l9=function(_la){var _lb=new T(function(){return _jE(_la);}),_lc=new T(function(){return _l9(_la);}),_ld=[1,function(_le){return A(_kx,[_le,function(_lf){return E([0,function(_lg){return E(E(_lg)[1])==92?E(_lc):[2];}]);}]);}];return _aO([0,function(_lh){return E(E(_lh)[1])==92?E([0,function(_li){var _lj=E(E(_li)[1]);switch(_lj){case 9:return E(_ld);case 10:return E(_ld);case 11:return E(_ld);case 12:return E(_ld);case 13:return E(_ld);case 32:return E(_ld);case 38:return E(_lc);case 160:return E(_ld);default:var _lk=u_iswspace(_lj);return E(_lk)==0?[2]:E(_ld);}}]):[2];}],[0,function(_ll){var _lm=E(_ll);return E(_lm[1])==92?E(_lb):A(_la,[[0,_lm,_0]]);}]);},_ln=function(_lo,_lp){var _lq=new T(function(){return A(_lp,[[1,new T(function(){return A(_lo,[_g]);})]]);});return _l9(function(_lr){var _ls=E(_lr),_lt=E(_ls[1]);return E(_lt[1])==34?!E(_ls[2])?E(_lq):_ln(function(_lu){return A(_lo,[[1,_lt,_lu]]);},_lp):_ln(function(_lv){return A(_lo,[[1,_lt,_lv]]);},_lp);});},_lw=unCStr("_\'"),_lx=function(_ly){var _lz=u_iswalnum(_ly);return E(_lz)==0?_dQ(_bl,[0,_ly],_lw):true;},_lA=function(_lB){return _lx(E(_lB)[1]);},_lC=unCStr(",;()[]{}`"),_lD=function(_lE){return A(_lE,[_g]);},_lF=function(_lG,_lH){var _lI=function(_lJ){var _lK=E(_lJ);if(!_lK[0]){return E(_lD);}else{var _lL=_lK[1];if(!A(_lG,[_lL])){return E(_lD);}else{var _lM=new T(function(){return _lI(_lK[2]);});return function(_lN){var _lO=new T(function(){return A(_lM,[function(_lP){return A(_lN,[[1,_lL,_lP]]);}]);});return [0,function(_lQ){return E(_lO);}];};}}};return [1,function(_lR){return A(_lI,[_lR,_lH]);}];},_lS=unCStr(".."),_lT=unCStr("::"),_lU=unCStr("->"),_lV=[0,64],_lW=[1,_lV,_g],_lX=[0,126],_lY=[1,_lX,_g],_lZ=unCStr("=>"),_m0=[1,_lZ,_g],_m1=[1,_lY,_m0],_m2=[1,_lW,_m1],_m3=[1,_lU,_m2],_m4=unCStr("<-"),_m5=[1,_m4,_m3],_m6=[0,124],_m7=[1,_m6,_g],_m8=[1,_m7,_m5],_m9=[1,_iX,_g],_ma=[1,_m9,_m8],_mb=[0,61],_mc=[1,_mb,_g],_md=[1,_mc,_ma],_me=[1,_lT,_md],_mf=[1,_lS,_me],_mg=function(_mh){var _mi=new T(function(){return A(_mh,[_cj]);});return _aO([1,function(_mj){return E(_mj)[0]==0?E(_mi):[2];}],new T(function(){var _mk=new T(function(){return _jE(function(_ml){var _mm=E(_ml);return (function(_mn,_mo){var _mp=new T(function(){return A(_mh,[[0,_mn]]);});return !E(_mo)?E(E(_mn)[1])==39?[2]:[0,function(_mq){return E(E(_mq)[1])==39?E(_mp):[2];}]:[0,function(_mr){return E(E(_mr)[1])==39?E(_mp):[2];}];})(_mm[1],_mm[2]);});});return _aO([0,function(_ms){return E(E(_ms)[1])==39?E([0,function(_mt){var _mu=E(_mt);switch(E(_mu[1])){case 39:return [2];case 92:return E(_mk);default:var _mv=new T(function(){return A(_mh,[[0,_mu]]);});return [0,function(_mw){return E(E(_mw)[1])==39?E(_mv):[2];}];}}]):[2];}],new T(function(){var _mx=new T(function(){return _ln(_H,_mh);});return _aO([0,function(_my){return E(E(_my)[1])==34?E(_mx):[2];}],new T(function(){return _aO([0,function(_mz){return !_dQ(_bl,_mz,_lC)?[2]:A(_mh,[[2,[1,_mz,_g]]]);}],new T(function(){return _aO([0,function(_mA){return !_dQ(_bl,_mA,_dV)?[2]:_lF(_dW,function(_mB){var _mC=[1,_mA,_mB];return !_dQ(_bC,_mC,_mf)?A(_mh,[[4,_mC]]):A(_mh,[[2,_mC]]);});}],new T(function(){return _aO([0,function(_mD){var _mE=E(_mD),_mF=_mE[1],_mG=u_iswalpha(_mF);return E(_mG)==0?E(_mF)==95?_lF(_lA,function(_mH){return A(_mh,[[3,[1,_mE,_mH]]]);}):[2]:_lF(_lA,function(_mI){return A(_mh,[[3,[1,_mE,_mI]]]);});}],new T(function(){return _bX(_e0,_dL,_mh);}));}));}));}));}));}));},_mJ=function(_mK){var _mL=new T(function(){return _mg(_mK);});return [1,function(_mM){return A(_kx,[_mM,function(_mN){return E(_mL);}]);}];},_mO=[0,0],_mP=function(_mQ,_mR){var _mS=new T(function(){return A(_mQ,[_mO,function(_mT){var _mU=new T(function(){return A(_mR,[_mT]);});return _mJ(function(_mV){var _mW=E(_mV);if(_mW[0]==2){var _mX=E(_mW[1]);return _mX[0]==0?[2]:E(E(_mX[1])[1])==41?E(_mX[2])[0]==0?E(_mU):[2]:[2];}else{return [2];}});}]);});return _mJ(function(_mY){var _mZ=E(_mY);if(_mZ[0]==2){var _n0=E(_mZ[1]);return _n0[0]==0?[2]:E(E(_n0[1])[1])==40?E(_n0[2])[0]==0?E(_mS):[2]:[2];}else{return [2];}});},_n1=function(_n2,_n3,_n4){var _n5=function(_n6,_n7){var _n8=new T(function(){return _mg(function(_n9){return A(_n2,[_n9,_n6,function(_na){return A(_n7,[new T(function(){return [0, -E(_na)[1]];})]);}]);});});return _aO(_mJ(function(_nb){var _nc=E(_nb);if(_nc[0]==4){var _nd=E(_nc[1]);return _nd[0]==0?A(_n2,[_nc,_n6,_n7]):E(E(_nd[1])[1])==45?E(_nd[2])[0]==0?E([1,function(_ne){return A(_kx,[_ne,function(_nf){return E(_n8);}]);}]):A(_n2,[_nc,_n6,_n7]):A(_n2,[_nc,_n6,_n7]);}else{return A(_n2,[_nc,_n6,_n7]);}}),new T(function(){return _mP(_n5,_n7);}));};return _n5(_n3,_n4);},_ng=function(_nh,_ni){return [2];},_nj=function(_nk,_nl){return _ng(_nk,_nl);},_nm=function(_nn){var _no=E(_nn);return _no[0]==0?[1,new T(function(){return _dm(new T(function(){return _jC(E(_no[1])[1]);}),_dd,_no[2]);})]:E(_no[2])[0]==0?E(_no[3])[0]==0?[1,new T(function(){return _dm(_dc,_dd,_no[1]);})]:[0]:[0];},_np=function(_nq){var _nr=E(_nq);if(_nr[0]==5){var _ns=_nm(_nr[1]);if(!_ns[0]){return E(_ng);}else{var _nt=new T(function(){return [0,_eo(_ns[1])];});return function(_nu,_nv){return A(_nv,[_nt]);};}}else{return E(_nj);}},_nw=function(_nk,_nl){return _n1(_np,_nk,_nl);},_nx=function(_ny,_nz){var _nA=function(_nB,_nC){var _nD=new T(function(){return A(_nC,[_g]);}),_nE=new T(function(){return A(_ny,[_mO,function(_nF){return _nA(_ec,function(_nG){return A(_nC,[[1,_nF,_nG]]);});}]);});return _mJ(function(_nH){var _nI=E(_nH);if(_nI[0]==2){var _nJ=E(_nI[1]);if(!_nJ[0]){return [2];}else{var _nK=_nJ[2];switch(E(E(_nJ[1])[1])){case 44:return E(_nK)[0]==0?!E(_nB)?[2]:E(_nE):[2];case 93:return E(_nK)[0]==0?E(_nD):[2];default:return [2];}}}else{return [2];}});},_nL=function(_nM){var _nN=new T(function(){return _aO(_nA(_0,_nM),new T(function(){return A(_ny,[_mO,function(_nO){return _nA(_ec,function(_nP){return A(_nM,[[1,_nO,_nP]]);});}]);}));});return _aO(_mJ(function(_nQ){var _nR=E(_nQ);if(_nR[0]==2){var _nS=E(_nR[1]);return _nS[0]==0?[2]:E(E(_nS[1])[1])==91?E(_nS[2])[0]==0?E(_nN):[2]:[2];}else{return [2];}}),new T(function(){return _mP(function(_nT,_nU){return _nL(_nU);},_nM);}));};return _nL(_nz);},_nV=function(_nW,_nX){return _nx(_nw,_nX);},_nY=new T(function(){return _nx(_nw,_bP);}),_nZ=function(_nl){return _aE(_nY,_nl);},_o0=function(_o1){var _o2=new T(function(){return _n1(_np,_o1,_bP);});return function(_ci){return _aE(_o2,_ci);};},_o3=[0,_o0,_nZ,_nw,_nV],_o4=function(_o5,_o6){return _3F(0,E(_o5)[1],_o6);},_o7=function(_o8,_o9){return _2w(_o4,_o8,_o9);},_oa=function(_ob,_oc,_od){return _3F(E(_ob)[1],E(_oc)[1],_od);},_oe=[0,_oa,_58,_o7],_of=unCStr("GHC.Types"),_og=unCStr("Int"),_oh=[0,I_fromBits([1521842780,3792221899]),I_fromBits([1346191152,3861967380]),_5O,_of,_og],_oi=[0,I_fromBits([1521842780,3792221899]),I_fromBits([1346191152,3861967380]),_oh,_g],_oj=function(_ok){return E(_oi);},_ol=function(_om){return E(E(_om)[1]);},_on=function(_oo){return E(E(_oo)[2]);},_op=function(_oq,_or){var _os=new T(function(){return A(_on,[_oq,_or]);}),_ot=new T(function(){return _ol(_oq);}),_ou=new T(function(){return _3q(_ot);}),_ov=new T(function(){return _30(_ot);});return function(_ow){return A(_ov,[_os,function(_ox){return A(_ou,[[0,_ox,_ow]]);}]);};},_oy=function(_oz,_oA){return A(_oz,[function(_){return jsFind(toJSStr(E(_oA)));}]);},_oB=[0],_oC=function(_oD){return E(E(_oD)[3]);},_oE=new T(function(){return E(_6H);}),_oF=new T(function(){return [0,"value"];}),_oG=function(_oH){return E(E(_oH)[6]);},_oI=unCStr("[]"),_oJ=[0,I_fromBits([4033920485,4128112366]),I_fromBits([786266835,2297333520]),_5O,_of,_oI],_oK=[0,I_fromBits([4033920485,4128112366]),I_fromBits([786266835,2297333520]),_oJ,_g],_oL=function(_oM){return E(_oK);},_oN=unCStr("Char"),_oO=[0,I_fromBits([3763641161,3907222913]),I_fromBits([1343745632,586881778]),_5O,_of,_oN],_oP=[0,I_fromBits([3763641161,3907222913]),I_fromBits([1343745632,586881778]),_oO,_g],_oQ=function(_oR){return E(_oP);},_oS=new T(function(){return _6I(_oL,_oQ);}),_oT=new T(function(){return A(_oS,[_6H]);}),_oU=function(_oV){return E(E(_oV)[1]);},_oW=[0,0],_oX=[0,32],_oY=[0,10],_oZ=function(_p0){var _p1=E(_p0);if(!_p1[0]){return E(_H);}else{var _p2=_p1[1],_p3=E(_p1[2]);if(!_p3[0]){return _p4(_oY,_p2);}else{var _p5=new T(function(){return _oZ(_p3);}),_p6=new T(function(){return _p4(_oY,_p2);});return function(_p7){return A(_p6,[[1,_oX,new T(function(){return A(_p5,[_p7]);})]]);};}}},_p8=unCStr("->"),_p9=[1,_p8,_g],_pa=[1,_of,_p9],_pb=[1,_5O,_pa],_pc=[0,32],_pd=function(_pe){var _pf=E(_pe);if(!_pf[0]){return [0];}else{var _pg=_pf[1],_ph=E(_pf[2]);return _ph[0]==0?E(_pg):_1G(_pg,[1,_pc,new T(function(){return _pd(_ph);})]);}},_pi=new T(function(){return _pd(_pb);}),_pj=new T(function(){var _pk=_6c(_pi);return [0,_pk[1],_pk[2],_5O,_of,_p8];}),_pl=function(_pm,_pn){var _po=E(_pm);return _po[0]==0?E(_pn):A(_po[1],[new T(function(){return _pl(_po[2],_pn);})]);},_pp=[0,I_fromBits([4033920485,4128112366]),I_fromBits([786266835,2297333520])],_pq=[1,_5Q,_g],_pr=function(_ps){var _pt=E(_ps);if(!_pt[0]){return [0];}else{var _pu=E(_pt[1]);return [1,[0,_pu[1],_pu[2]],new T(function(){return _pr(_pt[2]);})];}},_pv=new T(function(){var _pw=_1G(_g,_pq);if(!_pw[0]){return E(_oJ);}else{var _px=_6c(new T(function(){return _60(_6o(_6z,[1,_pp,new T(function(){return _pr(_pw);})]));}));return E(_oJ);}}),_py=[0,40],_pz=function(_pA){return _p4(_oY,_pA);},_pB=[0,8],_pC=unCStr(" -> "),_pD=[0,9],_pE=[0,93],_pF=[0,91],_pG=[0,41],_pH=[0,44],_pI=function(_pA){return [1,_pH,_pA];},_pJ=function(_pK,_pL){var _pM=E(_pL);return _pM[0]==0?[0]:[1,_pK,[1,_pM[1],new T(function(){return _pJ(_pK,_pM[2]);})]];},_p4=function(_pN,_pO){var _pP=E(_pO),_pQ=_pP[3],_pR=E(_pP[4]);if(!_pR[0]){return function(_pS){return _1G(E(_pQ)[5],_pS);};}else{var _pT=_pR[1],_pU=new T(function(){var _pV=E(_pQ)[5],_pW=new T(function(){return _oZ(_pR);}),_pX=new T(function(){return E(_pN)[1]<=9?function(_pY){return _1G(_pV,[1,_oX,new T(function(){return A(_pW,[_pY]);})]);}:function(_pZ){return [1,_3E,new T(function(){return _1G(_pV,[1,_oX,new T(function(){return A(_pW,[[1,_3D,_pZ]]);})]);})];};}),_q0=E(_pV);if(!_q0[0]){return E(_pX);}else{if(E(E(_q0[1])[1])==40){var _q1=E(_q0[2]);return _q1[0]==0?E(_pX):E(E(_q1[1])[1])==44?function(_q2){return [1,_py,new T(function(){return A(new T(function(){var _q3=_6o(_pz,_pR);if(!_q3[0]){return E(_H);}else{var _q4=new T(function(){return _pJ(_pI,_q3[2]);});return function(_ci){return _pl([1,_q3[1],_q4],_ci);};}}),[[1,_pG,_q2]]);})];}:E(_pX);}else{return E(_pX);}}}),_q5=E(_pR[2]);if(!_q5[0]){var _q6=E(_pQ),_q7=E(_pv),_q8=hs_eqWord64(_q6[1],_q7[1]);if(!E(_q8)){return E(_pU);}else{var _q9=hs_eqWord64(_q6[2],_q7[2]);if(!E(_q9)){return E(_pU);}else{var _qa=new T(function(){return _p4(_oW,_pT);});return function(_qb){return [1,_pF,new T(function(){return A(_qa,[[1,_pE,_qb]]);})];};}}}else{if(!E(_q5[2])[0]){var _qc=E(_pQ),_qd=E(_pj),_qe=hs_eqWord64(_qc[1],_qd[1]);if(!E(_qe)){return E(_pU);}else{var _qf=hs_eqWord64(_qc[2],_qd[2]);if(!E(_qf)){return E(_pU);}else{var _qg=new T(function(){return _p4(_pB,_q5[1]);}),_qh=new T(function(){return _p4(_pD,_pT);});return E(_pN)[1]<=8?function(_qi){return A(_qh,[new T(function(){return _1G(_pC,new T(function(){return A(_qg,[_qi]);}));})]);}:function(_qj){return [1,_3E,new T(function(){return A(_qh,[new T(function(){return _1G(_pC,new T(function(){return A(_qg,[[1,_3D,_qj]]);}));})]);})];};}}}else{return E(_pU);}}}},_qk=function(_ql,_qm,_qn,_qo,_qp,_qq){var _qr=E(_ql),_qs=_qr[1],_qt=_qr[3],_qu=new T(function(){return A(_qt,[_oB]);}),_qv=new T(function(){return _oC(_qp);}),_qw=new T(function(){return _oG(_qp);}),_qx=new T(function(){return unAppCStr("\" as type ",new T(function(){return A(_p4,[_oW,A(_qn,[_oE]),_g]);}));}),_qy=new T(function(){return A(_oU,[_qo,_8]);});return A(_qs,[new T(function(){return _oy(_qm,_qq);}),function(_qz){var _qA=E(_qz);return _qA[0]==0?E(_qu):A(_qs,[new T(function(){return A(_qm,[function(_){var _qB=jsGet(E(_qA[1])[1],E(_oF)[1]);return [1,new T(function(){return fromJSStr(_qB);})];}]);}),function(_qC){var _qD=E(_qC);if(!_qD[0]){return E(_qu);}else{var _qE=_qD[1];if(!E(new T(function(){var _qF=A(_qn,[_oE]),_qG=E(_oT),_qH=hs_eqWord64(_qF[1],_qG[1]);if(!E(_qH)){return false;}else{var _qI=hs_eqWord64(_qF[2],_qG[2]);return E(_qI)==0?false:true;}}))){var _qJ=new T(function(){return A(_qt,[[1,_qE,new T(function(){return A(_qw,[new T(function(){return A(_qv,[new T(function(){return unAppCStr("can\'t read \"",new T(function(){return _1G(_qE,_qx);}));})]);})]);})]]);}),_qK=A(_qy,[_qE]);if(!_qK[0]){return E(_qJ);}else{var _qL=E(_qK[1]);return E(_qL[2])[0]==0?E(_qK[2])[0]==0?A(_qt,[[2,_qL[1]]]):E(_qJ):E(_qJ);}}else{return A(_qt,[[2,_qE]]);}}}]);}]);},_qM=1,_qN=function(_qO){return E(E(_qO)[9]);},_qP=function(_qQ,_qR){return A(_3q,[_qQ,[0,_qR,_qR]]);},_qS=function(_qT,_qU,_qV){return A(_3q,[_qT,[0,_A,_qU]]);},_qW=function(_qX){return E(E(_qX)[2]);},_qY=function(_qZ,_r0,_r1,_r2,_r3){var _r4=new T(function(){return _92(_qZ);}),_r5=new T(function(){return _94(_r4);}),_r6=new T(function(){return _ol(_r0);}),_r7=new T(function(){return _3s(_r6);}),_r8=new T(function(){return _3K([0,coercionToken],_r7,function(_r9){return _qP(_r6,_r9);},function(_ra,_rb){return _qS(_r6,_ra,_rb);});}),_rc=new T(function(){return _3q(_r6);}),_rd=new T(function(){return _30(_r6);}),_re=new T(function(){return _3q(_r6);}),_rf=new T(function(){return _30(_r6);}),_rg=new T(function(){return _3q(_r6);}),_rh=new T(function(){return _30(_r6);}),_ri=new T(function(){return _3q(_r6);}),_rj=new T(function(){return _30(_r6);}),_rk=new T(function(){return _qW(_r2);}),_rl=new T(function(){return _qN(_qZ);});return function(_rm,_rn,_ro){return function(_rp){return A(_rj,[new T(function(){var _rq=E(_rm);return _rq[0]==0?A(_r8,[_rp]):A(_ri,[[0,_rq[1],_rp]]);}),function(_rr){var _rs=new T(function(){return E(E(_rr)[1]);}),_rt=new T(function(){return _qk(_r7,function(_ru){return _op(_r0,_ru);},_r1,_r3,_qZ,_rs);}),_rv=new T(function(){return A(_rl,[_rs,_rn,new T(function(){var _rw=E(_ro);if(!_rw[0]){return [0];}else{var _rx=_rw[1],_ry=_1q(_r1,_oS,_rx);return _ry[0]==0?A(_rk,[_rx]):E(_ry[1]);}}),_0,_9]);});return A(_rh,[new T(function(){var _rz=new T(function(){return E(E(_rr)[2]);});return A(_rg,[[0,_rz,_rz]]);}),function(_rA){return A(_rf,[new T(function(){return A(_re,[[0,_A,new T(function(){var _rB=E(E(_rA)[1]);return [0,_rB[1],_rB[2],_qM,_rB[4],_rB[5],_rB[6]];})]]);}),function(_rC){return A(_rd,[new T(function(){return A(_rt,[new T(function(){return E(E(_rC)[2]);})]);}),function(_rD){var _rE=E(_rD),_rF=_rE[2],_rG=E(_rE[1]);switch(_rG[0]){case 0:return A(_rc,[[0,[0,_rv,_9],_rF]]);case 1:return A(_rc,[[0,[0,new T(function(){return A(_r5,[new T(function(){return A(_rl,[_rs,_rn,_rG[1],_0,_9]);}),_rG[2]]);}),_9],_rF]]);default:var _rH=_rG[1];return A(_rc,[[0,[0,new T(function(){return A(_rl,[_rs,_rn,new T(function(){var _rI=_1q(_r1,_oS,_rH);return _rI[0]==0?A(_rk,[_rH]):E(_rI[1]);}),_0,_9]);}),[1,_rH]],_rF]]);}}]);}]);}]);}]);};};},_rJ=new T(function(){return _qY(_8F,_9L,_oj,_oe,_o3);}),_rK=new T(function(){return A(_rJ,[_9,_9K,_9]);}),_rL=unCStr("keydown"),_rM=unCStr("mousemove"),_rN=unCStr("blur"),_rO=unCStr("focus"),_rP=unCStr("change"),_rQ=unCStr("unload"),_rR=unCStr("load"),_rS=unCStr("keyup"),_rT=unCStr("keypress"),_rU=unCStr("mouseup"),_rV=unCStr("mousedown"),_rW=unCStr("dblclick"),_rX=unCStr("click"),_rY=unCStr("mouseout"),_rZ=unCStr("mouseover"),_s0=function(_s1){switch(E(_s1)[0]){case 0:return E(_rR);case 1:return E(_rQ);case 2:return E(_rP);case 3:return E(_rO);case 4:return E(_rN);case 5:return E(_rM);case 6:return E(_rZ);case 7:return E(_rY);case 8:return E(_rX);case 9:return E(_rW);case 10:return E(_rV);case 11:return E(_rU);case 12:return E(_rT);case 13:return E(_rS);default:return E(_rL);}},_s2=[0],_s3=unCStr("OnLoad"),_s4=[0,_s3,_s2],_s5=function(_){var _=0,_s6=newMVar(),_=putMVar(_s6,_s4);return [0,_s6];},_s7=new T(function(){return _2(_s5);}),_s8=function(_s9,_sa,_){var _sb=A(_s9,[_]);return die(_sa);},_sc=function(_sd,_se,_sf,_){return _s8(function(_){var _=putMVar(_se,_sd);return _A;},_sf,_);},_sg=function(_sh,_){var _si=0;if(!E(_si)){return (function(_){var _sj=E(_s7)[1],_sk=takeMVar(_sj),_sl=jsCatch(function(_){return (function(_){return _sh;})();},function(_X,_){return _sc(_sk,_sj,_X,_);}),_=putMVar(_sj,_sl);return _A;})();}else{var _sm=E(_s7)[1],_sn=takeMVar(_sm),_so=jsCatch(function(_){return _sh;},function(_X,_){return _sc(_sn,_sm,_X,_);}),_=putMVar(_sm,_so);return _A;}},_sp=unCStr("true"),_sq=function(_sr,_ss){while(1){var _st=E(_sr);if(!_st[0]){return E(_ss)[0]==0?true:false;}else{var _su=E(_ss);if(!_su[0]){return false;}else{if(E(_st[1])[1]!=E(_su[1])[1]){return false;}else{_sr=_st[2];_ss=_su[2];continue;}}}}},_sv=new T(function(){return [0,"keydown"];}),_sw=new T(function(){return [0,"mousemove"];}),_sx=new T(function(){return [0,"blur"];}),_sy=new T(function(){return [0,"focus"];}),_sz=new T(function(){return [0,"change"];}),_sA=new T(function(){return [0,"unload"];}),_sB=new T(function(){return [0,"load"];}),_sC=new T(function(){return [0,"keyup"];}),_sD=new T(function(){return [0,"keypress"];}),_sE=new T(function(){return [0,"mouseup"];}),_sF=new T(function(){return [0,"mousedown"];}),_sG=new T(function(){return [0,"dblclick"];}),_sH=new T(function(){return [0,"click"];}),_sI=new T(function(){return [0,"mouseout"];}),_sJ=new T(function(){return [0,"mouseover"];}),_sK=function(_sL){switch(E(_sL)[0]){case 0:return E(_sB);case 1:return E(_sA);case 2:return E(_sz);case 3:return E(_sy);case 4:return E(_sx);case 5:return E(_sw);case 6:return E(_sJ);case 7:return E(_sI);case 8:return E(_sH);case 9:return E(_sG);case 10:return E(_sF);case 11:return E(_sE);case 12:return E(_sD);case 13:return E(_sC);default:return E(_sv);}},_sM=function(_sN,_sO,_sP){var _sQ=new T(function(){return _s0(_sO);}),_sR=new T(function(){return _sK(_sO);});return function(_sS,_){var _sT=A(_sN,[_sS,_]),_sU=E(_sT),_sV=_sU[1],_sW=E(_sQ),_sX=jsGetAttr(_sV,toJSStr(_sW));if(!_sq(fromJSStr(_sX),_sp)){var _sY=E(_sP),_sZ=jsSetCB(_sV,E(_sR)[1],E([0,_sP])[1]),_t0=A(_B,[_H,_sU,_sW,_sp,_]);return _sU;}else{return _sU;}};},_t1=function(_t2,_t3){var _t4=new T(function(){return _s0(_t3);}),_t5=[0,_t4,_s2];return function(_t6,_){var _t7=E(_t6),_t8=E(_t7[4]),_t9=_t8[1],_ta=_t8[2],_tb=A(_t2,[_t7,_]),_tc=E(_tb),_td=E(_tc[1]),_te=_td[1];return [0,[0,new T(function(){var _tf=E(_t3);switch(_tf[0]){case 0:return _sM(_te,_tf,function(_){var _tg=_sg(_t5,_),_th=A(_t9,[_]),_ti=E(_th);if(!_ti[0]){return _A;}else{var _tj=A(_ta,[_ti[1],_]);return _A;}});case 1:return _sM(_te,_tf,function(_){var _tk=_sg(_t5,_),_tl=A(_t9,[_]),_tm=E(_tl);if(!_tm[0]){return _A;}else{var _tn=A(_ta,[_tm[1],_]);return _A;}});case 2:return _sM(_te,_tf,function(_){var _to=_sg(_t5,_),_tp=A(_t9,[_]),_tq=E(_tp);if(!_tq[0]){return _A;}else{var _tr=A(_ta,[_tq[1],_]);return _A;}});case 3:return _sM(_te,_tf,function(_){var _ts=_sg(_t5,_),_tt=A(_t9,[_]),_tu=E(_tt);if(!_tu[0]){return _A;}else{var _tv=A(_ta,[_tu[1],_]);return _A;}});case 4:return _sM(_te,_tf,function(_){var _tw=_sg(_t5,_),_tx=A(_t9,[_]),_ty=E(_tx);if(!_ty[0]){return _A;}else{var _tz=A(_ta,[_ty[1],_]);return _A;}});case 5:return _sM(_te,_tf,function(_tA,_){var _tB=_sg([0,_t4,[2,E(_tA)]],_),_tC=A(_t9,[_]),_tD=E(_tC);if(!_tD[0]){return _A;}else{var _tE=A(_ta,[_tD[1],_]);return _A;}});case 6:return _sM(_te,_tf,function(_tF,_){var _tG=_sg([0,_t4,[2,E(_tF)]],_),_tH=A(_t9,[_]),_tI=E(_tH);if(!_tI[0]){return _A;}else{var _tJ=A(_ta,[_tI[1],_]);return _A;}});case 7:return _sM(_te,_tf,function(_){var _tK=A(_t9,[_]),_tL=E(_tK);if(!_tL[0]){return _A;}else{var _tM=A(_ta,[_tL[1],_]);return _A;}});case 8:return _sM(_te,_tf,function(_tN,_tO,_){var _tP=_sg([0,_t4,[1,_tN,E(_tO)]],_),_tQ=A(_t9,[_]),_tR=E(_tQ);if(!_tR[0]){return _A;}else{var _tS=A(_ta,[_tR[1],_]);return _A;}});case 9:return _sM(_te,_tf,function(_tT,_tU,_){var _tV=_sg([0,_t4,[1,_tT,E(_tU)]],_),_tW=A(_t9,[_]),_tX=E(_tW);if(!_tX[0]){return _A;}else{var _tY=A(_ta,[_tX[1],_]);return _A;}});case 10:return _sM(_te,_tf,function(_tZ,_u0,_){var _u1=_sg([0,_t4,[1,_tZ,E(_u0)]],_),_u2=A(_t9,[_]),_u3=E(_u2);if(!_u3[0]){return _A;}else{var _u4=A(_ta,[_u3[1],_]);return _A;}});case 11:return _sM(_te,_tf,function(_u5,_u6,_){var _u7=_sg([0,_t4,[1,_u5,E(_u6)]],_),_u8=A(_t9,[_]),_u9=E(_u8);if(!_u9[0]){return _A;}else{var _ua=A(_ta,[_u9[1],_]);return _A;}});case 12:return _sM(_te,_tf,function(_ub,_){var _uc=_sg([0,_t4,[3,_ub]],_),_ud=A(_t9,[_]),_ue=E(_ud);if(!_ue[0]){return _A;}else{var _uf=A(_ta,[_ue[1],_]);return _A;}});case 13:return _sM(_te,_tf,function(_ug,_){var _uh=_sg([0,_t4,[3,_ug]],_),_ui=A(_t9,[_]),_uj=E(_ui);if(!_uj[0]){return _A;}else{var _uk=A(_ta,[_uj[1],_]);return _A;}});default:return _sM(_te,_tf,function(_ul,_){var _um=_sg([0,_t4,[3,_ul]],_),_un=A(_t9,[_]),_uo=E(_un);if(!_uo[0]){return _A;}else{var _up=A(_ta,[_uo[1],_]);return _A;}});}}),_td[2]],_tc[2]];};},_uq=new T(function(){return _t1(_rK,_9J);}),_ur=function(_us,_){var _ut=A(_uq,[_us,_]),_uu=E(_ut),_uv=E(_uu[1]);return [0,[0,function(_uw,_){var _ux=A(_uv[1],[_uw,_]),_uy=_5m(_uw,_);return _uw;},_uv[2]],_uu[2]];},_uz=new T(function(){return [1,_ur,_uz];}),_uA=function(_uB,_uC){var _uD=E(_uB);if(!_uD){return [0];}else{var _uE=E(_uC);return _uE[0]==0?[0]:[1,_uE[1],new T(function(){return _uA(_uD-1|0,_uE[2]);})];}},_uF=function(_uG,_uH){return _uG<0?[0]:_uA(_uG,_uH);},_uI=function(_uJ,_uK){var _uL=E(_uJ)[1];return _uL>0?_uF(_uL,_uK):[0];},_uM=function(_uN){return E(_uN);},_uO=function(_uP){var _uQ=new T(function(){return _9C(_5E,_uI(_uP,_uz));}),_uR=new T(function(){return _4Z(_4S,new T(function(){return unAppCStr("This widget sum ",new T(function(){return _1G(_3F(0,E(_uP)[1],_g),_5A);}));}));});return function(_uS,_){var _uT=_4f(_uQ,_5s,_uS,_),_uU=E(_uT),_uV=E(_uU[1]),_uW=new T(function(){return _4Z(_uM,_uV[1]);});return [0,[0,function(_uX,_){var _uY=A(_uR,[_uX,_]),_uZ=A(_uW,[_uX,_]);return _uX;},_uV[2]],_uU[2]];};},_v0=new T(function(){return _uO(_4R);}),_v1=unCStr("center"),_v2=function(_v3,_v4){var _v5=new T(function(){return A(_v3,[_v4]);});return function(_v6,_){var _v7=jsCreateElem(toJSStr(E(_v1))),_v8=jsAppendChild(_v7,E(_v6)[1]),_v9=[0,_v7],_va=A(_v5,[_v9,_]);return _v9;};},_vb=function(_vc,_){return _vc;},_vd=unCStr("Two counters. One is pure and recursive, the other is stateful"),_ve=new T(function(){return _4Z(_4S,_vd);}),_vf=[8,coercionToken],_vg=function(_vh){return _aO(_mJ(function(_vi){var _vj=E(_vi);return _vj[0]==0?A(_vh,[_vj[1]]):[2];}),new T(function(){return _mP(_vk,_vh);}));},_vk=function(_vl,_vm){return _vg(_vm);},_vn=function(_vo){return _aO(_aO(_mJ(function(_vp){var _vq=E(_vp);return _vq[0]==1?A(_vo,[_vq[1]]):[2];}),new T(function(){return _nx(_vk,_vo);})),new T(function(){return _mP(_vr,_vo);}));},_vr=function(_vs,_vt){return _vn(_vt);},_vu=new T(function(){return _mP(_vr,_bP);}),_vv=new T(function(){return _nx(_vk,_bP);}),_vw=function(_vx){var _vy=E(_vx);return _vy[0]==1?[3,_vy[1],_bO]:[2];},_vz=new T(function(){return _mg(_vw);}),_vA=function(_vB){return E(_vz);},_vC=function(_vD){return A(_kx,[_vD,_vA]);},_vE=[1,_vC],_vF=new T(function(){return _aO(_vE,_vv);}),_vG=new T(function(){return _aO(_vF,_vu);}),_vH=function(_nl){return _aE(_vG,_nl);},_vI=new T(function(){return _vg(_bP);}),_vJ=function(_nl){return _aE(_vI,_nl);},_vK=function(_vL){return E(_vJ);},_vM=[0,_vK,_vH,_vk,_vr],_vN=function(_vO){return E(E(_vO)[4]);},_vP=function(_vQ,_vR,_vS){return _nx(new T(function(){return _vN(_vQ);}),_vS);},_vT=function(_vU){var _vV=new T(function(){return _nx(new T(function(){return _vN(_vU);}),_bP);});return function(_ci){return _aE(_vV,_ci);};},_vW=function(_vX,_vY){var _vZ=new T(function(){return A(_vN,[_vX,_vY,_bP]);});return function(_ci){return _aE(_vZ,_ci);};},_w0=function(_w1){return [0,function(_nl){return _vW(_w1,_nl);},new T(function(){return _vT(_w1);}),new T(function(){return _vN(_w1);}),function(_nk,_nl){return _vP(_w1,_nk,_nl);}];},_w2=new T(function(){return _w0(_vM);}),_w3=unCStr("Prelude.(!!): negative index\n"),_w4=new T(function(){return err(_w3);}),_w5=unCStr("Prelude.(!!): index too large\n"),_w6=new T(function(){return err(_w5);}),_w7=function(_w8,_w9){while(1){var _wa=E(_w8);if(!_wa[0]){return E(_w6);}else{var _wb=E(_w9);if(!_wb){return E(_wa[1]);}else{_w8=_wa[2];_w9=_wb-1|0;continue;}}}},_wc=unCStr("ACK"),_wd=unCStr("BEL"),_we=unCStr("BS"),_wf=unCStr("SP"),_wg=[1,_wf,_g],_wh=unCStr("US"),_wi=[1,_wh,_wg],_wj=unCStr("RS"),_wk=[1,_wj,_wi],_wl=unCStr("GS"),_wm=[1,_wl,_wk],_wn=unCStr("FS"),_wo=[1,_wn,_wm],_wp=unCStr("ESC"),_wq=[1,_wp,_wo],_wr=unCStr("SUB"),_ws=[1,_wr,_wq],_wt=unCStr("EM"),_wu=[1,_wt,_ws],_wv=unCStr("CAN"),_ww=[1,_wv,_wu],_wx=unCStr("ETB"),_wy=[1,_wx,_ww],_wz=unCStr("SYN"),_wA=[1,_wz,_wy],_wB=unCStr("NAK"),_wC=[1,_wB,_wA],_wD=unCStr("DC4"),_wE=[1,_wD,_wC],_wF=unCStr("DC3"),_wG=[1,_wF,_wE],_wH=unCStr("DC2"),_wI=[1,_wH,_wG],_wJ=unCStr("DC1"),_wK=[1,_wJ,_wI],_wL=unCStr("DLE"),_wM=[1,_wL,_wK],_wN=unCStr("SI"),_wO=[1,_wN,_wM],_wP=unCStr("SO"),_wQ=[1,_wP,_wO],_wR=unCStr("CR"),_wS=[1,_wR,_wQ],_wT=unCStr("FF"),_wU=[1,_wT,_wS],_wV=unCStr("VT"),_wW=[1,_wV,_wU],_wX=unCStr("LF"),_wY=[1,_wX,_wW],_wZ=unCStr("HT"),_x0=[1,_wZ,_wY],_x1=[1,_we,_x0],_x2=[1,_wd,_x1],_x3=[1,_wc,_x2],_x4=unCStr("ENQ"),_x5=[1,_x4,_x3],_x6=unCStr("EOT"),_x7=[1,_x6,_x5],_x8=unCStr("ETX"),_x9=[1,_x8,_x7],_xa=unCStr("STX"),_xb=[1,_xa,_x9],_xc=unCStr("SOH"),_xd=[1,_xc,_xb],_xe=unCStr("NUL"),_xf=[1,_xe,_xd],_xg=[0,92],_xh=unCStr("\\DEL"),_xi=unCStr("\\a"),_xj=unCStr("\\\\"),_xk=unCStr("\\SO"),_xl=unCStr("\\r"),_xm=unCStr("\\f"),_xn=unCStr("\\v"),_xo=unCStr("\\n"),_xp=unCStr("\\t"),_xq=unCStr("\\b"),_xr=function(_xs,_xt){if(_xs<=127){var _xu=E(_xs);switch(_xu){case 92:return _1G(_xj,_xt);case 127:return _1G(_xh,_xt);default:if(_xu<32){var _xv=E(_xu);switch(_xv){case 7:return _1G(_xi,_xt);case 8:return _1G(_xq,_xt);case 9:return _1G(_xp,_xt);case 10:return _1G(_xo,_xt);case 11:return _1G(_xn,_xt);case 12:return _1G(_xm,_xt);case 13:return _1G(_xl,_xt);case 14:return _1G(_xk,new T(function(){var _xw=E(_xt);return _xw[0]==0?[0]:E(E(_xw[1])[1])==72?unAppCStr("\\&",_xw):E(_xw);}));default:return _1G([1,_xg,new T(function(){var _xx=_xv;return _xx>=0?_w7(_xf,_xx):E(_w4);})],_xt);}}else{return [1,[0,_xu],_xt];}}}else{return [1,_xg,new T(function(){var _xy=jsShowI(_xs);return _1G(fromJSStr(_xy),new T(function(){var _xz=E(_xt);if(!_xz[0]){return [0];}else{var _xA=E(_xz[1])[1];return _xA<48?E(_xz):_xA>57?E(_xz):unAppCStr("\\&",_xz);}}));})];}},_xB=[0,39],_xC=[1,_xB,_g],_xD=unCStr("\'\\\'\'"),_xE=function(_xF){var _xG=E(E(_xF)[1]);return _xG==39?E(_xD):[1,_xB,new T(function(){return _xr(_xG,_xC);})];},_xH=[0,34],_xI=unCStr("\\\""),_xJ=function(_xK,_xL){var _xM=E(_xK);if(!_xM[0]){return E(_xL);}else{var _xN=_xM[2],_xO=E(E(_xM[1])[1]);return _xO==34?_1G(_xI,new T(function(){return _xJ(_xN,_xL);})):_xr(_xO,new T(function(){return _xJ(_xN,_xL);}));}},_xP=function(_xQ,_xR){return [1,_xH,new T(function(){return _xJ(_xQ,[1,_xH,_xR]);})];},_xS=function(_xT){return _1G(_xD,_xT);},_xU=function(_xV,_xW){var _xX=E(E(_xW)[1]);return _xX==39?E(_xS):function(_xY){return [1,_xB,new T(function(){return _xr(_xX,[1,_xB,_xY]);})];};},_xZ=[0,_xU,_xE,_xP],_y0=function(_y1){return E(E(_y1)[3]);},_y2=function(_y3,_y4){return A(_y0,[_y3,_y4,_g]);},_y5=function(_y6,_y7,_y8){return _2w(new T(function(){return _y0(_y6);}),_y7,_y8);},_y9=function(_ya){var _yb=new T(function(){return _y0(_ya);});return [0,function(_yc){return E(_yb);},function(_xT){return _y2(_ya,_xT);},function(_yd,_xT){return _y5(_ya,_yd,_xT);}];},_ye=new T(function(){return _y9(_xZ);}),_yf=unCStr("submit"),_yg=new T(function(){return A(_qY,[_8F,_9L,_oS,_ye,_w2,_9,_yf]);}),_yh=[0,43],_yi=[1,_yh,_g],_yj=[1,_yi],_yk=new T(function(){return A(_yg,[_yj]);}),_yl=new T(function(){return _t1(_yk,_vf);}),_ym=function(_yn,_yo,_yp,_){var _yq=A(_yo,[_yp,_]),_yr=E(_yq),_ys=E(_yr[1]);return [0,[0,function(_yt,_){var _yu=_3Y(_3X,_yt,_),_yv=A(_B,[_H,_yu,_z,_yn,_]),_yw=A(_ys[1],[_yu,_]);return _yu;},_ys[2]],_yr[2]];},_yx=new T(function(){return _3K(_13,_3x,_11,_Y);}),_yy=new T(function(){return _3K(_13,_3x,_11,_Y);}),_yz=function(_yA,_yB,_yC,_){var _yD=A(_yy,[_yC,_]),_yE=A(_yx,[new T(function(){return E(E(_yD)[2]);}),_]),_yF=new T(function(){return E(E(_yD)[1]);});return _4f(function(_X,_){return _ym(_yF,_yA,_X,_);},function(_yG){var _yH=new T(function(){return A(_yB,[_yG]);});return function(_yI,_){var _yJ=A(_yH,[_yI,_]),_yK=E(_yJ),_yL=E(_yK[1]);return [0,[0,function(_yM,_){var _yN=E(_yF),_yO=jsFind(toJSStr(_yN)),_yP=E(_yO);if(!_yP[0]){return _45(_yN);}else{var _yQ=E(_yP[1]),_yR=A(_7,[E(_yQ[1]),_]),_yS=jsKillChild(E(_yQ)[1],_yR),_yT=A(_yL[1],[_yM,_]);return _yM;}},_yL[2]],_yK[2]];};},new T(function(){return E(E(_yE)[2]);}),_);},_yU=function(_yV){var _yW=new T(function(){return _yU(new T(function(){return [0,E(_yV)[1]+1|0];}));}),_yX=new T(function(){return _5c(_4S,new T(function(){return _58(_yV);}));});return function(_ci,_yY){return _yz(function(_yZ,_){var _z0=A(_yl,[_yZ,_]),_z1=E(_z0),_z2=E(_z1[1]);return [0,[0,function(_z3,_){var _z4=A(_yX,[_z3,_]),_z5=A(_z2[1],[_z3,_]);return _z3;},_z2[2]],_z1[2]];},function(_z6){return E(_yW);},_ci,_yY);};},_z7=unCStr("main"),_z8=unCStr("Main"),_z9=unCStr("Counter"),_za=[0,I_fromBits([4029179641,2406453796]),I_fromBits([547056354,2957229436]),_z7,_z8,_z9],_zb=function(_zc,_zd){var _ze=hs_leWord64(_zc,_zd);return E(_ze)==0?false:true;},_zf=function(_zg,_zh,_zi,_zj){var _zk=hs_eqWord64(_zg,_zi);if(!E(_zk)){var _zl=hs_leWord64(_zg,_zi);return E(_zl)==0?false:true;}else{return _zb(_zh,_zj);}},_zm=function(_zn,_zo){var _zp=E(_zn),_zq=_zp[1],_zr=_zp[2],_zs=E(_zo),_zt=_zs[1],_zu=_zs[2],_zv=hs_eqWord64(_zq,_zt);if(!E(_zv)){return !_zf(_zq,_zr,_zt,_zu)?2:0;}else{var _zw=hs_eqWord64(_zr,_zu);return E(_zw)==0?!_zf(_zq,_zr,_zt,_zu)?2:0:1;}},_zx=unCStr("Failure in Data.Map.balanceL"),_zy=new T(function(){return err(_zx);}),_zz=function(_zA,_zB,_zC,_zD){var _zE=E(_zD);if(!_zE[0]){var _zF=_zE[1],_zG=E(_zC);if(!_zG[0]){var _zH=_zG[1],_zI=_zG[2],_zJ=_zG[3];if(_zH<=(imul(3,_zF)|0)){return [0,(1+_zH|0)+_zF|0,E(E(_zA)),_zB,E(_zG),E(_zE)];}else{var _zK=E(_zG[4]);if(!_zK[0]){var _zL=_zK[1],_zM=E(_zG[5]);if(!_zM[0]){var _zN=_zM[1],_zO=_zM[2],_zP=_zM[3],_zQ=_zM[4];if(_zN>=(imul(2,_zL)|0)){var _zR=function(_zS){var _zT=E(_zM[5]);return _zT[0]==0?[0,(1+_zH|0)+_zF|0,E(_zO),_zP,E([0,(1+_zL|0)+_zS|0,E(_zI),_zJ,E(_zK),E(_zQ)]),E([0,(1+_zF|0)+_zT[1]|0,E(E(_zA)),_zB,E(_zT),E(_zE)])]:[0,(1+_zH|0)+_zF|0,E(_zO),_zP,E([0,(1+_zL|0)+_zS|0,E(_zI),_zJ,E(_zK),E(_zQ)]),E([0,1+_zF|0,E(E(_zA)),_zB,E(_f),E(_zE)])];},_zU=E(_zQ);return _zU[0]==0?_zR(_zU[1]):_zR(0);}else{return [0,(1+_zH|0)+_zF|0,E(_zI),_zJ,E(_zK),E([0,(1+_zF|0)+_zN|0,E(E(_zA)),_zB,E(_zM),E(_zE)])];}}else{return E(_zy);}}else{return E(_zy);}}}else{return [0,1+_zF|0,E(E(_zA)),_zB,E(_f),E(_zE)];}}else{var _zV=E(_zC);if(!_zV[0]){var _zW=_zV[1],_zX=_zV[2],_zY=_zV[3],_zZ=_zV[5],_A0=E(_zV[4]);if(!_A0[0]){var _A1=_A0[1],_A2=E(_zZ);if(!_A2[0]){var _A3=_A2[1],_A4=_A2[2],_A5=_A2[3],_A6=_A2[4];if(_A3>=(imul(2,_A1)|0)){var _A7=function(_A8){var _A9=E(_A2[5]);return _A9[0]==0?[0,1+_zW|0,E(_A4),_A5,E([0,(1+_A1|0)+_A8|0,E(_zX),_zY,E(_A0),E(_A6)]),E([0,1+_A9[1]|0,E(E(_zA)),_zB,E(_A9),E(_f)])]:[0,1+_zW|0,E(_A4),_A5,E([0,(1+_A1|0)+_A8|0,E(_zX),_zY,E(_A0),E(_A6)]),E([0,1,E(E(_zA)),_zB,E(_f),E(_f)])];},_Aa=E(_A6);return _Aa[0]==0?_A7(_Aa[1]):_A7(0);}else{return [0,1+_zW|0,E(_zX),_zY,E(_A0),E([0,1+_A3|0,E(E(_zA)),_zB,E(_A2),E(_f)])];}}else{return [0,3,E(_zX),_zY,E(_A0),E([0,1,E(E(_zA)),_zB,E(_f),E(_f)])];}}else{var _Ab=E(_zZ);return _Ab[0]==0?[0,3,E(_Ab[2]),_Ab[3],E([0,1,E(_zX),_zY,E(_f),E(_f)]),E([0,1,E(E(_zA)),_zB,E(_f),E(_f)])]:[0,2,E(E(_zA)),_zB,E(_zV),E(_f)];}}else{return [0,1,E(E(_zA)),_zB,E(_f),E(_f)];}}},_Ac=unCStr("Failure in Data.Map.balanceR"),_Ad=new T(function(){return err(_Ac);}),_Ae=function(_Af,_Ag,_Ah,_Ai){var _Aj=E(_Ah);if(!_Aj[0]){var _Ak=_Aj[1],_Al=E(_Ai);if(!_Al[0]){var _Am=_Al[1],_An=_Al[2],_Ao=_Al[3];if(_Am<=(imul(3,_Ak)|0)){return [0,(1+_Ak|0)+_Am|0,E(E(_Af)),_Ag,E(_Aj),E(_Al)];}else{var _Ap=E(_Al[4]);if(!_Ap[0]){var _Aq=_Ap[1],_Ar=_Ap[2],_As=_Ap[3],_At=_Ap[4],_Au=E(_Al[5]);if(!_Au[0]){var _Av=_Au[1];if(_Aq>=(imul(2,_Av)|0)){var _Aw=function(_Ax){var _Ay=E(_Af),_Az=E(_Ap[5]);return _Az[0]==0?[0,(1+_Ak|0)+_Am|0,E(_Ar),_As,E([0,(1+_Ak|0)+_Ax|0,E(_Ay),_Ag,E(_Aj),E(_At)]),E([0,(1+_Av|0)+_Az[1]|0,E(_An),_Ao,E(_Az),E(_Au)])]:[0,(1+_Ak|0)+_Am|0,E(_Ar),_As,E([0,(1+_Ak|0)+_Ax|0,E(_Ay),_Ag,E(_Aj),E(_At)]),E([0,1+_Av|0,E(_An),_Ao,E(_f),E(_Au)])];},_AA=E(_At);return _AA[0]==0?_Aw(_AA[1]):_Aw(0);}else{return [0,(1+_Ak|0)+_Am|0,E(_An),_Ao,E([0,(1+_Ak|0)+_Aq|0,E(E(_Af)),_Ag,E(_Aj),E(_Ap)]),E(_Au)];}}else{return E(_Ad);}}else{return E(_Ad);}}}else{return [0,1+_Ak|0,E(E(_Af)),_Ag,E(_Aj),E(_f)];}}else{var _AB=E(_Ai);if(!_AB[0]){var _AC=_AB[1],_AD=_AB[2],_AE=_AB[3],_AF=_AB[5],_AG=E(_AB[4]);if(!_AG[0]){var _AH=_AG[1],_AI=_AG[2],_AJ=_AG[3],_AK=_AG[4],_AL=E(_AF);if(!_AL[0]){var _AM=_AL[1];if(_AH>=(imul(2,_AM)|0)){var _AN=function(_AO){var _AP=E(_Af),_AQ=E(_AG[5]);return _AQ[0]==0?[0,1+_AC|0,E(_AI),_AJ,E([0,1+_AO|0,E(_AP),_Ag,E(_f),E(_AK)]),E([0,(1+_AM|0)+_AQ[1]|0,E(_AD),_AE,E(_AQ),E(_AL)])]:[0,1+_AC|0,E(_AI),_AJ,E([0,1+_AO|0,E(_AP),_Ag,E(_f),E(_AK)]),E([0,1+_AM|0,E(_AD),_AE,E(_f),E(_AL)])];},_AR=E(_AK);return _AR[0]==0?_AN(_AR[1]):_AN(0);}else{return [0,1+_AC|0,E(_AD),_AE,E([0,1+_AH|0,E(E(_Af)),_Ag,E(_f),E(_AG)]),E(_AL)];}}else{return [0,3,E(_AI),_AJ,E([0,1,E(E(_Af)),_Ag,E(_f),E(_f)]),E([0,1,E(_AD),_AE,E(_f),E(_f)])];}}else{var _AS=E(_AF);return _AS[0]==0?[0,3,E(_AD),_AE,E([0,1,E(E(_Af)),_Ag,E(_f),E(_f)]),E(_AS)]:[0,2,E(E(_Af)),_Ag,E(_f),E(_AB)];}}else{return [0,1,E(E(_Af)),_Ag,E(_f),E(_f)];}}},_AT=function(_AU,_AV,_AW,_AX,_AY,_AZ){var _B0=E(_AZ);if(!_B0[0]){var _B1=_B0[2],_B2=_B0[3],_B3=_B0[4],_B4=_B0[5];switch(_zm([0,_AU,_AV,_AW,_AX],_B1)){case 0:return _zz(_B1,_B2,_AT(_AU,_AV,_AW,_AX,_AY,_B3),_B4);case 1:return [0,_B0[1],E([0,_AU,_AV,_AW,_AX]),_AY,E(_B3),E(_B4)];default:return _Ae(_B1,_B2,_B3,_AT(_AU,_AV,_AW,_AX,_AY,_B4));}}else{return [0,1,E([0,_AU,_AV,_AW,_AX]),_AY,E(_f),E(_f)];}},_B5=[0,_2X,_5q],_B6=function(_B7,_){return [0,[0,_2X,[1,_B7]],_B7];},_B8=[1,_A],_B9=function(_Ba){var _Bb=new T(function(){return [0,E(_Ba)[1]+1|0];}),_Bc=new T(function(){return _5c(_4S,new T(function(){return _58(_Ba);}));});return function(_ci,_yY){return _4f(function(_Bd,_){return [0,[0,_Bc,_B8],_Bd];},function(_Be,_Bf,_){return (function(_Bf,_){return _4f(_B6,function(_Bg){return function(_Bh,_){return [0,_B5,new T(function(){var _Bi=E(_Bg);return [0,_Bi[1],_Bi[2],_Bi[3],_Bi[4],_Bi[5],new T(function(){return _AT(I_fromBits([4029179641,2406453796]),I_fromBits([547056354,2957229436]),_za,_g,_Bb,_Bi[6]);})];})];};},_Bf,_);})(_Bf,_);},_ci,_yY);};},_Bj=[0,I_fromBits([4029179641,2406453796]),I_fromBits([547056354,2957229436]),_za,_g],_Bk=function(_Bl){return E(_Bj);},_Bm=function(_Bn,_Bo,_Bp,_Bq,_Br){while(1){var _Bs=E(_Br);if(!_Bs[0]){switch(_zm([0,_Bn,_Bo,_Bp,_Bq],_Bs[2])){case 0:_Br=_Bs[4];continue;case 1:return [1,_Bs[3]];default:_Br=_Bs[5];continue;}}else{return [0];}}},_Bt=function(_Bu,_Bv){var _Bw=E(_Bu),_Bx=_Bw[1],_By=_Bw[2],_Bz=_Bw[3],_BA=_Bw[4],_BB=E(_Bv);if(!_BB[0]){switch(_zm(_Bw,_BB[2])){case 0:return _Bm(_Bx,_By,_Bz,_BA,_BB[4]);case 1:return [1,_BB[3]];default:return _Bm(_Bx,_By,_Bz,_BA,_BB[5]);}}else{return [0];}},_BC=function(_BD,_BE,_BF,_BG){var _BH=E(_BE),_BI=_BH[1],_BJ=_BH[3],_BK=new T(function(){return A(_BG,[_oE]);}),_BL=new T(function(){return A(_BJ,[_9]);});return A(_BI,[new T(function(){return A(_BI,[_BF,function(_BM){return A(_BJ,[new T(function(){var _BN=E(_BD);return E(E(_BM)[6]);})]);}]);}),function(_BO){var _BP=_Bt(_BK,_BO);return _BP[0]==0?E(_BL):A(_BJ,[[1,_BP[1]]]);}]);},_BQ=new T(function(){return _BC(_13,_3x,_11,_Bk);}),_BR=function(_BS){var _BT=new T(function(){return _yU(_BS);});return function(_BU,_){var _BV=A(_BT,[_BU,_]),_BW=E(_BV),_BX=E(_BW[1]),_BY=_4f(_yl,function(_BZ){return function(_Bf,_){return _4f(function(_C0,_){var _C1=A(_BQ,[_C0,_]);return [0,[0,_vb,new T(function(){var _C2=E(E(_C1)[1]);return _C2[0]==0?E([1,_BS]):E(_C2);})],new T(function(){return E(E(_C1)[2]);})];},_B9,_Bf,_);};},_BW[2],_),_C3=E(_BY),_C4=E(_C3[1]),_C5=new T(function(){return _v2(_uM,function(_C6,_){var _C7=A(_BX[1],[_C6,_]),_C8=A(_C4[1],[_C6,_]);return _C6;});});return [0,[0,function(_C9,_){var _Ca=A(_ve,[_C9,_]),_Cb=_5m(_C9,_),_Cc=A(_C5,[_C9,_]);return _C9;},new T(function(){var _Cd=E(_BX[2]);return _Cd[0]==0?E(_C4[2]):E(_Cd);})],_C3[2]];};},_Ce=new T(function(){return _BR(_4R);}),_Cf=[0,4],_Cg=function(_Ch,_Ci){return [1,_Ci,new T(function(){return _Cg(_Ch,new T(function(){return A(_Ch,[_Ci]);}));})];},_Cj=[0,1],_Ck=[1,_Cj,_g],_Cl=[1,_5B,_g],_Cm=function(_Cn,_Co,_Cp){var _Cq=E(_Co);if(!_Cq[0]){return [0];}else{var _Cr=E(_Cp);return _Cr[0]==0?[0]:[1,new T(function(){return A(_Cn,[_Cq[1],_Cr[1]]);}),new T(function(){return _Cm(_Cn,_Cq[2],_Cr[2]);})];}},_Cs=function(_Ct){return _Cm(_8U,[1,_5B,_Ct],new T(function(){return _1G(_Ct,_Cl);}));},_Cu=new T(function(){return _Cg(_Cs,_Ck);}),_Cv=unCStr(" rows of the Pascal triangle "),_Cw=function(_Cx){var _Cy=new T(function(){return _2w(_o4,_Cx,_g);});return function(_ci,_yY){return _4S(_Cy,_ci,_yY);};},_Cz=unCStr("text-align:center"),_CA=unCStr("style"),_CB=function(_CC,_CD){var _CE=new T(function(){return _4Z(_Cw,_CC);});return [1,function(_CF,_){var _CG=A(_CE,[_CF,_]),_CH=A(_B,[_H,_CG,_CA,_Cz,_]);return _CG;},_CD];},_CI=function(_CJ,_CK){var _CL=E(_CJ);if(!_CL[0]){return [0];}else{var _CM=_CL[1];return _CK>1?_CB(_CM,new T(function(){return _CI(_CL[2],_CK-1|0);})):_CB(_CM,_g);}},_CN=function(_CO){var _CP=new T(function(){return _4Z(_4S,new T(function(){return unAppCStr("Show ",new T(function(){return _1G(_3F(0,E(_CO)[1],_g),_Cv);}));}));});return function(_CQ,_){return [0,[0,function(_CR,_){var _CS=A(_CP,[_CR,_]),_CT=_8s(new T(function(){var _CU=E(_CO)[1];return _CU>0?_CI(_Cu,_CU):[0];}),_CR,_);return _CR;},_9],_CQ];};},_CV=new T(function(){return _CN(_Cf);}),_CW=unCStr("Different input elements:"),_CX=new T(function(){return _4Z(_4S,_CW);}),_CY=unCStr(" returns: "),_CZ=[1,_xH,_g],_D0=function(_D1){var _D2=new T(function(){return _5c(_4S,[1,_xH,new T(function(){return _xJ(_D1,_CZ);})]);});return function(_D3,_){return [0,[0,function(_D4,_){var _D5=_4S(_CY,_D4,_),_D6=A(_D2,[_D4,_]);return _D4;},_B8],_D3];};},_D7=unCStr("blue"),_D8=[1,_D7,_g],_D9=unCStr("green"),_Da=[1,_D9,_D8],_Db=unCStr("red"),_Dc=[1,_Db,_Da],_Dd=function(_De){return E(E(_De)[15]);},_Df=function(_Dg,_Dh,_){var _Di=jsGet(_Dg,toJSStr(E(_Dh)));return new T(function(){return fromJSStr(_Di);});},_Dj=function(_Dk,_Dl,_){return _Df(E(_Dk)[1],_Dl,_);},_Dm=unCStr("radio"),_Dn=new T(function(){return A(_oS,[_6H]);}),_Do=unCStr("name"),_Dp=unCStr("true"),_Dq=function(_Dr,_Ds,_Dt,_Du){var _Dv=new T(function(){return _ol(_Ds);}),_Dw=new T(function(){return _3K([0,coercionToken],_3s(_Dv),function(_Dx){return _qP(_Dv,_Dx);},function(_Dy,_Dz){return _qS(_Dv,_Dy,_Dz);});}),_DA=new T(function(){return _3q(_Dv);}),_DB=new T(function(){return _3q(_Dv);}),_DC=new T(function(){return _30(_Dv);}),_DD=new T(function(){return _30(_Dv);}),_DE=new T(function(){return _3q(_Dv);}),_DF=new T(function(){return _30(_Dv);}),_DG=new T(function(){return _3q(_Dv);}),_DH=new T(function(){return _30(_Dv);}),_DI=new T(function(){return _qN(_Dr);}),_DJ=new T(function(){return _Dd(_Dr);}),_DK=new T(function(){return _qW(_Du);});return function(_DL,_DM){return function(_DN){return A(_DC,[new T(function(){return A(_Dw,[_DN]);}),function(_DO){var _DP=new T(function(){return E(E(_DO)[1]);}),_DQ=new T(function(){return _op(_Ds,function(_){return jsFind(toJSStr(E(_DP)));});});return A(_DH,[new T(function(){var _DR=new T(function(){return E(E(_DO)[2]);});return A(_DG,[[0,_DR,_DR]]);}),function(_DS){return A(_DF,[new T(function(){return A(_DE,[[0,_A,new T(function(){var _DT=E(E(_DS)[1]);return [0,_DT[1],_DT[2],_qM,_DT[4],_DT[5],_DT[6]];})]]);}),function(_DU){return A(_DD,[new T(function(){return A(_DQ,[new T(function(){return E(E(_DU)[2]);})]);}),function(_DV){return A(_DC,[new T(function(){var _DW=E(_DV),_DX=_DW[2],_DY=E(_DW[1]);return _DY[0]==0?A(_DB,[[0,_g,_DX]]):A(_op,[_Ds,function(_){return _Dj(_DY[1],_6V,_);},_DX]);}),function(_DZ){var _E0=new T(function(){return !_sq(E(_DZ)[1],_Dp)?[0]:E([1,_DL]);});return A(_DA,[[0,[0,new T(function(){return A(_DJ,[new T(function(){return A(_DI,[_DP,_Dm,new T(function(){var _E1=A(_Dt,[_DL]),_E2=E(_Dn),_E3=hs_eqWord64(_E1[1],_E2[1]);if(!E(_E3)){return A(_DK,[_DL]);}else{var _E4=hs_eqWord64(_E1[2],_E2[2]);return E(_E4)==0?A(_DK,[_DL]):E(_DL);}}),new T(function(){return E(_E0)[0]==0?false:true;}),_9]);}),[1,[0,_Do,_DM],_g]]);}),new T(function(){var _E5=E(_E0);return _E5[0]==0?[0]:[1,_E5[1]];})],new T(function(){return E(E(_DZ)[2]);})]]);}]);}]);}]);}]);}]);};};},_E6=new T(function(){return _6I(_oL,_oQ);}),_E7=new T(function(){return _y9(_xZ);}),_E8=new T(function(){return _Dq(_8F,_9L,_E6,_E7);}),_E9=function(_Ea){var _Eb=E(_Ea);if(!_Eb[0]){return [0];}else{var _Ec=_Eb[1];return [1,function(_Ed){var _Ee=new T(function(){return _t1(new T(function(){return A(_E8,[_Ec,_Ed]);}),_vf);});return function(_Ef,_){var _Eg=A(_Ee,[_Ef,_]),_Eh=E(_Eg),_Ei=E(_Eh[1]);return [0,[0,function(_Ej,_){var _Ek=_4S(_Ec,_Ej,_),_El=A(_Ei[1],[_Ej,_]);return _Ej;},_Ei[2]],_Eh[2]];};},new T(function(){return _E9(_Eb[2]);})];}},_Em=new T(function(){return _E9(_Dc);}),_En=function(_Eo){return E(E(_Eo)[1]);},_Ep=function(_Eq,_Er){var _Es=new T(function(){return _92(_Er);}),_Et=new T(function(){return _En(_Es);}),_Eu=new T(function(){return _94(_Es);}),_Ev=function(_Ew){var _Ex=E(_Ew);if(!_Ex[0]){return [0,_Et,_9];}else{var _Ey=E(_Ex[1]),_Ez=_Ev(_Ex[2]);return [0,new T(function(){return A(_Eu,[_Ey[1],_Ez[1]]);}),new T(function(){var _EA=E(_Ey[2]);return _EA[0]==0?E(_Ez[2]):E(_EA);})];}},_EB=new T(function(){return _3q(_Eq);}),_EC=new T(function(){return _3K([0,coercionToken],_3s(_Eq),function(_ED){return _qP(_Eq,_ED);},function(_EE,_EF){return _qS(_Eq,_EE,_EF);});}),_EG=new T(function(){return _3q(_Eq);}),_EH=new T(function(){return _30(_Eq);}),_EI=new T(function(){return _30(_Eq);}),_EJ=new T(function(){return _30(_Eq);}),_EK=new T(function(){return _30(_Eq);});return function(_EL,_EM){return A(_EK,[new T(function(){return A(_EC,[_EM]);}),function(_EN){return A(_EJ,[new T(function(){var _EO=new T(function(){return E(E(_EN)[1]);}),_EP=function(_EQ){var _ER=E(_EQ);if(!_ER[0]){return function(_ES){return A(_EG,[[0,_g,_ES]]);};}else{var _ET=new T(function(){return _EP(_ER[2]);}),_EU=new T(function(){return A(_ER[1],[_EO]);});return function(_EV){return A(_EI,[new T(function(){return A(_EU,[_EV]);}),function(_EW){var _EX=new T(function(){return E(E(_EW)[1]);});return A(_EH,[new T(function(){return A(_ET,[new T(function(){return E(E(_EW)[2]);})]);}),function(_EY){return A(_EG,[[0,[1,_EX,new T(function(){return E(E(_EY)[1]);})],new T(function(){return E(E(_EY)[2]);})]]);}]);}]);};}};return A(_EP,[_EL,new T(function(){return E(E(_EN)[2]);})]);}),function(_EZ){var _F0=new T(function(){var _F1=_Ev(E(_EZ)[1]);return [0,_F1[1],_F1[2]];});return A(_EB,[[0,[0,new T(function(){return E(E(_F0)[1]);}),new T(function(){var _F2=E(E(_F0)[2]);return _F2[0]==0?[0]:[1,_F2[1]];})],new T(function(){return E(E(_EZ)[2]);})]]);}]);}]);};},_F3=new T(function(){return _Ep(_2Z,_8F);}),_F4=new T(function(){return A(_F3,[_Em]);}),_F5=function(_F6){var _F7=new T(function(){return _5c(_4S,new T(function(){return _2w(_xP,_F6,_g);}));});return function(_F8,_){return [0,[0,function(_F9,_){var _Fa=_4S(_CY,_F9,_),_Fb=A(_F7,[_F9,_]);return _F9;},_B8],_F8];};},_Fc=new T(function(){return _5c(_4S,_D9);}),_Fd=unCStr("checkbox"),_Fe=function(_Ff,_Fg){var _Fh=new T(function(){return _ol(_Fg);}),_Fi=new T(function(){return _3K([0,coercionToken],_3s(_Fh),function(_Fj){return _qP(_Fh,_Fj);},function(_Fk,_Fl){return _qS(_Fh,_Fk,_Fl);});}),_Fm=new T(function(){return _3q(_Fh);}),_Fn=new T(function(){return _3q(_Fh);}),_Fo=new T(function(){return _30(_Fh);}),_Fp=new T(function(){return _30(_Fh);}),_Fq=new T(function(){return _3q(_Fh);}),_Fr=new T(function(){return _30(_Fh);}),_Fs=new T(function(){return _3q(_Fh);}),_Ft=new T(function(){return _30(_Fh);}),_Fu=new T(function(){return _qN(_Ff);});return function(_Fv,_Fw){var _Fx=new T(function(){return !E(_Fv)?[0]:E(_Dp);});return function(_Fy){return A(_Fo,[new T(function(){return A(_Fi,[_Fy]);}),function(_Fz){var _FA=new T(function(){return E(E(_Fz)[1]);}),_FB=new T(function(){return _op(_Fg,function(_){return jsFind(toJSStr(E(_FA)));});}),_FC=new T(function(){return A(_Fu,[_FA,_Fd,_Fw,_Fv,_9]);});return A(_Ft,[new T(function(){var _FD=new T(function(){return E(E(_Fz)[2]);});return A(_Fs,[[0,_FD,_FD]]);}),function(_FE){return A(_Fr,[new T(function(){return A(_Fq,[[0,_A,new T(function(){var _FF=E(E(_FE)[1]);return [0,_FF[1],_FF[2],_qM,_FF[4],_FF[5],_FF[6]];})]]);}),function(_FG){return A(_Fp,[new T(function(){return A(_FB,[new T(function(){return E(E(_FG)[2]);})]);}),function(_FH){return A(_Fo,[new T(function(){var _FI=E(_FH),_FJ=_FI[2],_FK=E(_FI[1]);return _FK[0]==0?A(_Fn,[[0,_Fx,_FJ]]):A(_op,[_Fg,function(_){return _Dj(_FK[1],_6V,_);},_FJ]);}),function(_FL){return A(_Fm,[[0,[0,_FC,[1,[0,new T(function(){return !_sq(E(_FL)[1],_Dp)?[0]:E([1,_Fw,_g]);})]]],new T(function(){return E(E(_FL)[2]);})]]);}]);}]);}]);}]);}]);};};},_FM=new T(function(){return _Fe(_8F,_9L);}),_FN=unCStr("Green"),_FO=new T(function(){return A(_FM,[_0,_FN]);}),_FP=function(_FQ,_){var _FR=A(_FO,[_FQ,_]),_FS=E(_FR),_FT=E(_FS[1]);return [0,[0,function(_FU,_){var _FV=A(_FT[1],[_FU,_]),_FW=A(_Fc,[_FU,_]);return _FU;},_FT[2]],_FS[2]];},_FX=new T(function(){return _t1(_FP,_vf);}),_FY=new T(function(){return _5c(_4S,_D7);}),_FZ=new T(function(){return A(_FM,[_0,_D7]);}),_G0=function(_G1,_){var _G2=A(_FZ,[_G1,_]),_G3=E(_G2),_G4=E(_G3[1]);return [0,[0,function(_G5,_){var _G6=A(_G4[1],[_G5,_]),_G7=A(_FY,[_G5,_]);return _G5;},_G4[2]],_G3[2]];},_G8=new T(function(){return _t1(_G0,_vf);}),_G9=new T(function(){return _5c(_4S,_Db);}),_Ga=unCStr("Red"),_Gb=new T(function(){return A(_FM,[_0,_Ga]);}),_Gc=function(_Gd,_){var _Ge=A(_Gb,[_Gd,_]),_Gf=E(_Ge),_Gg=E(_Gf[1]);return [0,[0,function(_Gh,_){var _Gi=A(_Gg[1],[_Gh,_]),_Gj=A(_G9,[_Gh,_]);return _Gh;},_Gg[2]],_Gf[2]];},_Gk=new T(function(){return _t1(_Gc,_vf);}),_Gl=function(_Gm,_){var _Gn=A(_Gk,[_Gm,_]),_Go=E(_Gn),_Gp=E(_Go[1]),_Gq=A(_FX,[_Go[2],_]),_Gr=E(_Gq),_Gs=E(_Gr[1]),_Gt=A(_G8,[_Gr[2],_]),_Gu=E(_Gt),_Gv=E(_Gu[1]);return [0,[0,function(_Gw,_){var _Gx=A(_Gp[1],[_Gw,_]),_Gy=A(_Gs[1],[_Gw,_]),_Gz=A(_Gv[1],[_Gw,_]);return _Gw;},new T(function(){var _GA=E(_Gp[2]);if(!_GA[0]){return [0];}else{var _GB=E(_Gs[2]);if(!_GB[0]){return [0];}else{var _GC=E(_Gv[2]);return _GC[0]==0?[0]:[1,new T(function(){var _GD=function(_GE){var _GF=E(_GE);return _GF[0]==0?E(new T(function(){var _GG=function(_GH){var _GI=E(_GH);return _GI[0]==0?E(E(_GC[1])[1]):[1,_GI[1],new T(function(){return _GG(_GI[2]);})];};return _GG(E(_GB[1])[1]);})):[1,_GF[1],new T(function(){return _GD(_GF[2]);})];};return _GD(E(_GA[1])[1]);})];}}})],_Gu[2]];},_GJ=function(_GK){var _GL=new T(function(){return _5c(_4S,[1,_xH,new T(function(){return _xJ(_GK,_CZ);})]);});return function(_GM,_){return [0,[0,function(_GN,_){var _GO=_4S(_CY,_GN,_),_GP=A(_GL,[_GN,_]);return _GN;},_B8],_GM];};},_GQ=new T(function(){return _w0(_vM);}),_GR=function(_GS){return E(E(_GS)[11]);},_GT=function(_GU,_GV,_GW,_GX){var _GY=new T(function(){return _ol(_GV);}),_GZ=new T(function(){return _3s(_GY);}),_H0=new T(function(){return _3K([0,coercionToken],_GZ,function(_H1){return _qP(_GY,_H1);},function(_H2,_H3){return _qS(_GY,_H2,_H3);});}),_H4=new T(function(){return _3q(_GY);}),_H5=new T(function(){return _30(_GY);}),_H6=new T(function(){return _30(_GY);}),_H7=new T(function(){return _3q(_GY);}),_H8=new T(function(){return _30(_GY);}),_H9=new T(function(){return _3q(_GY);}),_Ha=new T(function(){return _30(_GY);}),_Hb=new T(function(){return _30(_GY);}),_Hc=new T(function(){return _GR(_GU);});return function(_Hd,_He){return A(_Hb,[new T(function(){return A(_H0,[_He]);}),function(_Hf){var _Hg=new T(function(){return E(E(_Hf)[1]);}),_Hh=new T(function(){return _qk(_GZ,function(_Hi){return _op(_GV,_Hi);},_GW,_GX,_GU,_Hg);});return A(_Ha,[new T(function(){var _Hj=new T(function(){return E(E(_Hf)[2]);});return A(_H9,[[0,_Hj,_Hj]]);}),function(_Hk){return A(_H8,[new T(function(){return A(_H7,[[0,_A,new T(function(){var _Hl=E(E(_Hk)[1]);return [0,_Hl[1],_Hl[2],_qM,_Hl[4],_Hl[5],_Hl[6]];})]]);}),function(_Hm){return A(_H6,[new T(function(){return A(_Hh,[new T(function(){return E(E(_Hm)[2]);})]);}),function(_Hn){return A(_H5,[new T(function(){return A(_Hd,[new T(function(){return E(E(_Hn)[2]);})]);}),function(_Ho){var _Hp=E(_Ho);return A(_H4,[[0,[0,new T(function(){return A(_Hc,[_Hg,E(_Hp[1])[1]]);}),new T(function(){var _Hq=E(E(_Hn)[1]);return _Hq[0]==2?[1,_Hq[1]]:[0];})],_Hp[2]]]);}]);}]);}]);}]);}]);};},_Hr=new T(function(){return _GT(_8F,_9L,_E6,_GQ);}),_Hs=new T(function(){return _xJ(_D7,_CZ);}),_Ht=new T(function(){return _xJ(_D7,_CZ);}),_Hu=new T(function(){return A(_oS,[_6H]);}),_Hv=new T(function(){var _Hw=A(_E6,[_D7]),_Hx=E(_Hu),_Hy=hs_eqWord64(_Hw[1],_Hx[1]);if(!E(_Hy)){return [1,_xH,_Hs];}else{var _Hz=hs_eqWord64(_Hw[2],_Hx[2]);return E(_Hz)==0?[1,_xH,_Ht]:E(_D7);}}),_HA=[0,_6T,_Hv],_HB=[1,_HA,_g],_HC=new T(function(){return _Q(_7q,_HB);}),_HD=new T(function(){return _xJ(_D9,_CZ);}),_HE=new T(function(){return _xJ(_D9,_CZ);}),_HF=new T(function(){var _HG=A(_E6,[_D9]),_HH=E(_Hu),_HI=hs_eqWord64(_HG[1],_HH[1]);if(!E(_HI)){return [1,_xH,_HD];}else{var _HJ=hs_eqWord64(_HG[2],_HH[2]);return E(_HJ)==0?[1,_xH,_HE]:E(_D9);}}),_HK=[0,_6T,_HF],_HL=[1,_HK,_g],_HM=new T(function(){return _Q(_7q,_HL);}),_HN=new T(function(){return _xJ(_Db,_CZ);}),_HO=new T(function(){return _xJ(_Db,_CZ);}),_HP=new T(function(){var _HQ=A(_E6,[_Db]),_HR=E(_Hu),_HS=hs_eqWord64(_HQ[1],_HR[1]);if(!E(_HS)){return [1,_xH,_HN];}else{var _HT=hs_eqWord64(_HQ[2],_HR[2]);return E(_HT)==0?[1,_xH,_HO]:E(_Db);}}),_HU=[0,_6T,_HP],_HV=[1,_HU,_g],_HW=new T(function(){return _Q(_7q,_HV);}),_HX=function(_HY,_){var _HZ=A(_HW,[_HY,_]),_I0=_4S(_Db,_HZ,_),_I1=A(_HM,[_HY,_]),_I2=_4S(_D9,_I1,_),_I3=A(_HC,[_HY,_]),_I4=_4S(_D7,_I3,_);return _HY;},_I5=[1,_Db],_I6=[0,_HX,_I5],_I7=function(_I8,_){return [0,_I6,_I8];},_I9=new T(function(){return A(_Hr,[_I7]);}),_Ia=new T(function(){return _t1(_I9,_vf);}),_Ib=function(_Ic,_){var _Id=_4f(_Gl,_F5,_Ic,_),_Ie=E(_Id),_If=_4f(_F4,_D0,_Ie[2],_),_Ig=E(_If),_Ih=_4f(_Ia,_GJ,_Ig[2],_),_Ii=E(_Ih),_Ij=E(_Ii[1]);return [0,[0,function(_Ik,_){var _Il=A(_CX,[_Ik,_]),_Im=A(E(_Ie[1])[1],[_Ik,_]),_In=_5m(_Ik,_),_Io=_5m(_Ik,_),_Ip=A(E(_Ig[1])[1],[_Ik,_]),_Iq=_5m(_Ik,_),_Ir=_5m(_Ik,_),_Is=A(_Ij[1],[_Ik,_]),_It=_5m(_Ik,_);return _Ik;},_Ij[2]],_Ii[2]];},_Iu=unCStr("This example draw a function of x between 10 and -10. You can define the function using javascript expressions"),_Iv=new T(function(){return _4Z(_4S,_Iu);}),_Iw=function(_Ix){var _Iy=jsShow(E(_Ix)[1]);return fromJSStr(_Iy);},_Iz=function(_IA){var _IB=new T(function(){return _Iw(_IA);});return function(_ci){return _1G(_IB,_ci);};},_IC=function(_ID,_IE,_IF){var _IG=E(_IF);if(!_IG[0]){return [0];}else{var _IH=_IG[2],_II=E(_IG[1]);return _ID!=_II[1]?[1,_II,new T(function(){return _IC(_ID,_IE,_IH);})]:_1G(_IE,new T(function(){return _IC(_ID,_IE,_IH);}));}},_IJ=[0,45],_IK=function(_IL,_IM,_IN){var _IO=new T(function(){return A(_IL,[[0, -_IN]]);}),_IP=new T(function(){return E(_IM)[1]<=6?function(_IQ){return [1,_IJ,new T(function(){return A(_IO,[_IQ]);})];}:function(_IR){return [1,_3E,[1,_IJ,new T(function(){return A(_IO,[[1,_3D,_IR]]);})]];};});if(_IN>=0){var _IS=isDoubleNegativeZero(_IN);return E(_IS)==0?A(_IL,[[0,_IN]]):E(_IP);}else{return E(_IP);}},_IT=unCStr("canvas"),_IU=unCStr("id"),_IV=unCStr("canvas"),_IW=function(_IX,_IY){var _IZ=new T(function(){return A(_IX,[_IY]);});return function(_J0,_){var _J1=jsCreateElem(toJSStr(E(_IV))),_J2=jsAppendChild(_J1,E(_J0)[1]),_J3=[0,_J1],_J4=A(_IZ,[_J3,_]);return _J3;};},_J5=new T(function(){return _IW(_uM,_2X);}),_J6=function(_J7,_){var _J8=A(_J5,[_J7,_]),_J9=A(_B,[_H,_J8,_IU,_IT,_]);return _J8;},_Ja=[0,_J6,_B8],_Jb=function(_Jc,_){return [0,_Ja,_Jc];},_Jd=unCStr("Pattern match failure in do expression at main.hs:182:5-12"),_Je=function(_Jf,_Jg){while(1){var _Jh=E(_Jg);if(!_Jh[0]){return false;}else{if(!A(_Jf,[_Jh[1]])){_Jg=_Jh[2];continue;}else{return true;}}}},_Ji=unCStr("x*x+x+10;"),_Jj=new T(function(){return [0,"(function(exp){ return eval(exp);})"];}),_Jk=new T(function(){return _5(_Jj);}),_Jl=function(_Jm,_){var _Jn=jsHasCtx2D(_Jm);if(!E(_Jn)){return _9;}else{var _Jo=jsGetCtx2D(_Jm);return [1,[0,[0,_Jo],[0,_Jm]]];}},_Jp=function(_Jq,_){return _Jl(E(_Jq)[1],_);},_Jr=function(_Js,_Jt){return A(_Js,[function(_){var _Ju=jsFind(toJSStr(E(_Jt))),_Jv=E(_Ju);return _Jv[0]==0?_9:_Jp(_Jv[1],_);}]);},_Jw=new T(function(){return _Jr(_H,_IT);}),_Jx=[0,-10],_Jy=[0,0],_Jz=[0,_Jx,_Jy],_JA=[0,10],_JB=[0,_JA,_Jy],_JC=[1,_JB,_g],_JD=[1,_Jz,_JC],_JE=function(_JF,_){return _A;},_JG=function(_JH){var _JI=E(_JH);if(!_JI[0]){return E(_JE);}else{var _JJ=E(_JI[1]);return function(_JK,_){var _JL=E(_JK)[1],_JM=jsMoveTo(_JL,E(_JJ[1])[1],E(_JJ[2])[1]);return (function(_JN,_){while(1){var _JO=E(_JN);if(!_JO[0]){return _A;}else{var _JP=E(_JO[1]),_JQ=jsLineTo(_JL,E(_JP[1])[1],E(_JP[2])[1]);_JN=_JO[2];continue;}}})(_JI[2],_);};}},_JR=new T(function(){return _JG(_JD);}),_JS=[0,30],_JT=[0,_Jy,_JS],_JU=[0,-30],_JV=[0,_Jy,_JU],_JW=[1,_JV,_g],_JX=[1,_JT,_JW],_JY=new T(function(){return _JG(_JX);}),_JZ=function(_K0,_K1,_K2){while(1){var _K3=E(_K1);if(!_K3[0]){return true;}else{var _K4=E(_K2);if(!_K4[0]){return false;}else{if(!A(_bm,[_K0,_K3[1],_K4[1]])){return false;}else{_K1=_K3[2];_K2=_K4[2];continue;}}}}},_K5=unCStr("alert"),_K6=function(_K7){return _JZ(_bl,_K5,_K7);},_K8=new T(function(){return [0,0/0];}),_K9=new T(function(){return [0,-1/0];}),_Ka=new T(function(){return [0,1/0];}),_Kb=[0,0],_Kc=function(_Kd,_Ke){while(1){var _Kf=E(_Kd);if(!_Kf[0]){_Kd=[1,I_fromInt(_Kf[1])];continue;}else{var _Kg=E(_Ke);if(!_Kg[0]){_Kd=_Kf;_Ke=[1,I_fromInt(_Kg[1])];continue;}else{return I_fromRat(_Kf[1],_Kg[1]);}}}},_Kh=function(_Ki,_Kj){var _Kk=E(_Ki);if(!_Kk[0]){var _Kl=_Kk[1],_Km=E(_Kj);return _Km[0]==0?_Kl==_Km[1]:I_compareInt(_Km[1],_Kl)==0?true:false;}else{var _Kn=_Kk[1],_Ko=E(_Kj);return _Ko[0]==0?I_compareInt(_Kn,_Ko[1])==0?true:false:I_compare(_Kn,_Ko[1])==0?true:false;}},_Kp=function(_Kq,_Kr){var _Ks=E(_Kq);if(!_Ks[0]){var _Kt=_Ks[1],_Ku=E(_Kr);return _Ku[0]==0?_Kt<_Ku[1]:I_compareInt(_Ku[1],_Kt)>0;}else{var _Kv=_Ks[1],_Kw=E(_Kr);return _Kw[0]==0?I_compareInt(_Kv,_Kw[1])<0:I_compare(_Kv,_Kw[1])<0;}},_Kx=function(_Ky,_Kz){return !_Kh(_Kz,_Kb)?[0,_Kc(_Ky,_Kz)]:!_Kh(_Ky,_Kb)?!_Kp(_Ky,_Kb)?E(_Ka):E(_K9):E(_K8);},_KA=function(_KB){var _KC=E(_KB);return _Kx(_KC[1],_KC[2]);},_KD=function(_KE){return [0,1/E(_KE)[1]];},_KF=function(_KG){var _KH=E(_KG),_KI=_KH[1];return _KI<0?[0, -_KI]:E(_KH);},_KJ=function(_KK){var _KL=E(_KK);return _KL[0]==0?_KL[1]:I_toNumber(_KL[1]);},_KM=function(_KN){return [0,_KJ(_KN)];},_KO=[0,0],_KP=[0,1],_KQ=[0,-1],_KR=function(_KS){var _KT=E(_KS)[1];return _KT!=0?_KT<=0?E(_KQ):E(_KP):E(_KO);},_KU=function(_KV,_KW){return [0,E(_KV)[1]-E(_KW)[1]];},_KX=function(_KY){return [0, -E(_KY)[1]];},_KZ=function(_L0,_L1){return [0,E(_L0)[1]+E(_L1)[1]];},_L2=function(_L3,_L4){return [0,E(_L3)[1]*E(_L4)[1]];},_L5=[0,_KZ,_L2,_KU,_KX,_KF,_KR,_KM],_L6=function(_L7,_L8){return [0,E(_L7)[1]/E(_L8)[1]];},_L9=[0,_L5,_L6,_KD,_KA],_La=function(_Lb,_Lc){return E(_Lb)[1]!=E(_Lc)[1]?true:false;},_Ld=function(_Le,_Lf){return E(_Le)[1]==E(_Lf)[1];},_Lg=[0,_Ld,_La],_Lh=function(_Li,_Lj){return E(_Li)[1]<E(_Lj)[1];},_Lk=function(_Ll,_Lm){return E(_Ll)[1]<=E(_Lm)[1];},_Ln=function(_Lo,_Lp){return E(_Lo)[1]>E(_Lp)[1];},_Lq=function(_Lr,_Ls){return E(_Lr)[1]>=E(_Ls)[1];},_Lt=function(_Lu,_Lv){var _Lw=E(_Lu)[1],_Lx=E(_Lv)[1];return _Lw>=_Lx?_Lw!=_Lx?2:1:0;},_Ly=function(_Lz,_LA){var _LB=E(_Lz),_LC=E(_LA);return _LB[1]>_LC[1]?E(_LB):E(_LC);},_LD=function(_LE,_LF){var _LG=E(_LE),_LH=E(_LF);return _LG[1]>_LH[1]?E(_LH):E(_LG);},_LI=[0,_Lg,_Lt,_Lh,_Lq,_Ln,_Lk,_Ly,_LD],_LJ=[0,1],_LK=function(_LL){return E(E(_LL)[1]);},_LM=function(_LN){return E(E(_LN)[2]);},_LO=function(_LP){return E(E(_LP)[6]);},_LQ=[0,2],_LR=function(_LS,_LT){var _LU=E(_LT);return [1,_LU,new T(function(){var _LV=_LK(_LS);return _LR(_LS,A(_LV[1],[_LU,new T(function(){return A(_LV[7],[_LJ]);})]));})];},_LW=function(_LX,_LY){var _LZ=E(_LY);if(!_LZ[0]){return [0];}else{var _M0=_LZ[1];return !A(_LX,[_M0])?[0]:[1,_M0,new T(function(){return _LW(_LX,_LZ[2]);})];}},_M1=function(_M2,_M3,_M4,_M5){var _M6=new T(function(){return _LO(_M2);});return _LW(function(_M7){return A(_M6,[_M7,new T(function(){var _M8=_LK(_M3),_M9=_M8[7];return A(_M8[1],[_M5,new T(function(){return A(_LM,[_M3,new T(function(){return A(_M9,[_LJ]);}),new T(function(){return A(_M9,[_LQ]);})]);})]);})]);},_LR(_M3,_M4));},_Ma=new T(function(){return _M1(_LI,_L9,_Jx,_JA);}),_Mb=function(_Mc){return [1,_Mc,new T(function(){var _Md=E(_Mc);return _Md[0]==0?[0]:_Mb(_Md[2]);})];},_Me=function(_Mf,_Mg){var _Mh=E(_Mf);if(!_Mh[0]){return [0];}else{var _Mi=E(_Mg);return _Mi[0]==0?[0]:[1,[0,_Mh[1],_Mi[1]],new T(function(){return _Me(_Mh[2],_Mi[2]);})];}},_Mj=function(_Mk){var _Ml=new T(function(){return !_Je(_K6,_Mb(_Mk))?E(_Mk):E(_Ji);}),_Mm=function(_Mn,_){var _Mo=E(_Mn);if(!_Mo[0]){return _g;}else{var _Mp=A(_Jk,[E(toJSStr(_IC(120,new T(function(){return A(_IK,[_Iz,_oW,E(_Mo[1])[1],_g]);}),_Ml))),_]),_Mq=_Mm(_Mo[2],_);return [1,[0,_Mp],_Mq];}};return function(_ci,_yY){return _4f(_Jb,function(_Mr,_Bf,_){return (function(_Ms,_){return [0,[0,function(_Mt,_){var _Mu=A(_Jw,[_]),_Mv=E(_Mu);if(!_Mv[0]){var _Mw=_2V(_Jd,_);return _Mt;}else{var _Mx=_Mm(_Ma,_),_My=E(_Mv[1]),_Mz=jsResetCanvas(E(_My[2])[1]),_MA=E(_My[1]),_MB=_MA[1],_MC=jsPushState(_MB),_MD=jsScale(_MB,3,1),_ME=jsPushState(_MB),_MF=jsTranslate(_MB,50,130),_MG=jsPushState(_MB),_MH=jsRotate(_MB,3.141592653589793),_MI=jsBeginPath(_MB),_MJ=A(_JR,[_MA,_]),_MK=A(_JY,[_MA,_]),_ML=A(_JG,[_Me(_Ma,_Mx),_MA,_]),_MM=jsStroke(_MB),_MN=jsPopState(_MB),_MO=jsPopState(_MB),_MP=jsPopState(_MB);return _Mt;}},_B8],_Ms];})(_Bf,_);},_ci,_yY);};},_MQ=[1,_Ji],_MR=new T(function(){return _qY(_8F,_9L,_oS,_ye,_w2);}),_MS=new T(function(){return A(_MR,[_9,_9K,_MQ]);}),_MT=new T(function(){return _t1(_MS,_9J);}),_MU=function(_MV,_){var _MW=A(_MT,[_MV,_]),_MX=E(_MW),_MY=E(_MX[1]);return [0,[0,function(_MZ,_){var _N0=A(_MY[1],[_MZ,_]),_N1=_5m(_MZ,_);return _MZ;},new T(function(){var _N2=E(_MY[2]);return _N2[0]==0?E(_MQ):E(_N2);})],_MX[2]];},_N3=function(_N4,_){var _N5=_4f(_MU,_Mj,_N4,_),_N6=E(_N5),_N7=E(_N6[1]),_N8=new T(function(){return _v2(_uM,_N7[1]);});return [0,[0,function(_N9,_){var _Na=A(_Iv,[_N9,_]),_Nb=A(_N8,[_N9,_]);return _N9;},_N7[2]],_N6[2]];},_Nc=unCStr("work?"),_Nd=new T(function(){return _Dq(_8F,_9L,_E6,_E7);}),_Ne=function(_Nf){return E(E(_Nf)[5]);},_Ng=unCStr("label"),_Nh=unCStr("for"),_Ni=function(_Nj,_Nk,_Nl,_Nm){var _Nn=new T(function(){return A(_Ne,[_Nk,_Ng,_Nl]);}),_No=new T(function(){return _92(_Nk);}),_Np=new T(function(){return _94(_No);}),_Nq=new T(function(){return _3q(_Nj);}),_Nr=new T(function(){return _30(_Nj);}),_Ns=new T(function(){return _Dd(_Nk);}),_Nt=new T(function(){return _3q(_Nj);}),_Nu=new T(function(){return _3q(_Nj);}),_Nv=new T(function(){return _30(_Nj);}),_Nw=new T(function(){return _30(_Nj);});return function(_Nx){return A(_Nw,[new T(function(){return A(_Nv,[new T(function(){return A(_Nu,[[0,_Nx,_Nx]]);}),function(_Ny){return A(_Nt,[[0,[1,_3y,new T(function(){var _Nz=E(E(_Ny)[1]);return _1G(_3F(0,E(_Nz[2])[1],_g),_Nz[1]);})],new T(function(){return E(E(_Ny)[2]);})]]);}]);}),function(_NA){var _NB=new T(function(){return A(_Ns,[_Nn,[1,[0,_Nh,new T(function(){return E(E(_NA)[1]);})],_g]]);});return A(_Nr,[new T(function(){return A(_Nm,[new T(function(){return E(E(_NA)[2]);})]);}),function(_NC){var _ND=E(_NC),_NE=E(_ND[1]);return A(_Nq,[[0,[0,new T(function(){return A(_Np,[_NB,_NE[1]]);}),_NE[2]],_ND[2]]]);}]);}]);};},_NF=function(_NG,_NH){return _Ni(_2Z,_8F,function(_Bf,_){return _4S(_NG,_Bf,_);},new T(function(){return _t1(new T(function(){return A(_Nd,[_NG,_NH]);}),_vf);}));},_NI=function(_K7){return _NF(_Nc,_K7);},_NJ=unCStr("study?"),_NK=function(_K7){return _NF(_NJ,_K7);},_NL=[1,_NK,_g],_NM=[1,_NI,_NL],_NN=new T(function(){return A(_F3,[_NM]);}),_NO=unCStr("Do you "),_NP=new T(function(){return _5c(_4S,_NO);}),_NQ=function(_NR,_){var _NS=A(_NN,[_NR,_]),_NT=E(_NS),_NU=E(_NT[1]);return [0,[0,function(_NV,_){var _NW=A(_NP,[_NV,_]),_NX=A(_NU[1],[_NV,_]),_NY=_5m(_NV,_);return _NV;},_NU[2]],_NT[2]];},_NZ=unCStr("do you enjoy your work? "),_O0=new T(function(){return _5c(_4S,_NZ);}),_O1=function(_O2,_O3,_){return [0,[0,_2X,[1,_O2]],_O3];},_O4=function(_O5,_O6,_O7,_){return _4f(_O5,function(_O8){return E(_O6);},_O7,_);},_O9=function(_Oa,_Ob,_X,_){return _O4(_Oa,_Ob,_X,_);},_Oc=function(_Od){return err(_Od);},_Oe=[0,_4f,_O9,_O1,_Oc],_Of=function(_Og,_Oh,_Oi,_Oj,_Ok,_Ol){var _Om=new T(function(){return _94(_Og);});return A(_Oh,[new T(function(){return A(_Oj,[_Ol]);}),function(_On){var _Oo=E(_On),_Op=E(_Oo[1]);return A(_Oh,[new T(function(){return A(_Ok,[_Oo[2]]);}),function(_Oq){var _Or=E(_Oq),_Os=E(_Or[1]);return A(_Oi,[[0,[0,new T(function(){return A(_Om,[_Op[1],_Os[1]]);}),new T(function(){var _Ot=E(_Op[2]);return _Ot[0]==0?E(_Os[2]):E(_Ot);})],_Or[2]]]);}]);}]);},_Ou=function(_Ov,_Ow,_Ox,_Oy,_Oz,_OA){var _OB=new T(function(){return _Dd(_Ox);});return A(_Ov,[new T(function(){return A(_Oy,[_OA]);}),function(_OC){var _OD=E(_OC),_OE=E(_OD[1]);return A(_Ow,[[0,[0,new T(function(){return A(_OB,[_OE[1],_Oz]);}),_OE[2]],_OD[2]]]);}]);},_OF=function(_OG){return E(E(_OG)[12]);},_OH=function(_OI,_OJ,_OK,_OL,_OM,_ON,_OO){var _OP=new T(function(){return A(_OF,[_OI,new T(function(){var _OQ=A(_OK,[_OM]),_OR=E(_Hu),_OS=hs_eqWord64(_OQ[1],_OR[1]);if(!E(_OS)){return A(_qW,[_OL,_OM]);}else{var _OT=hs_eqWord64(_OQ[2],_OR[2]);return E(_OT)==0?A(_qW,[_OL,_OM]):E(_OM);}}),_ON,_OO]);}),_OU=new T(function(){return _3q(_OJ);});return function(_OV){return A(_OU,[[0,[0,_OP,[1,_OM]],_OV]]);};},_OW=[0,_7s,_Dp],_OX=[1,_OW,_g],_OY=[0,_7s,_Dp],_OZ=[1,_OY,_g],_P0=function(_P1,_P2,_P3,_P4){var _P5=new T(function(){return _GT(_P4,_P3,_oS,_w2);}),_P6=new T(function(){return A(_3q,[_P1,_0]);}),_P7=new T(function(){return A(_3q,[_P1,_ec]);}),_P8=new T(function(){return _92(_P4);}),_P9=new T(function(){return _ol(_P3);}),_Pa=new T(function(){return _oC(_P4);}),_Pb=new T(function(){return _30(_P1);});return function(_Pc,_Pd,_Pe){return A(_Pb,[new T(function(){var _Pf=new T(function(){return !E(_Pc)?E(_OZ):[0];}),_Pg=new T(function(){return _OH(_P4,_P9,_oS,_ye,_Pe,new T(function(){return A(_Pa,[_Pe]);}),_0);}),_Ph=new T(function(){return !E(_Pc)?[0]:E(_OX);}),_Pi=new T(function(){return _OH(_P4,_P9,_oS,_ye,_Pd,new T(function(){return A(_Pa,[_Pd]);}),_0);});return A(_P5,[function(_Pj){var _Pk=E(_P9);return _Of(_P8,_Pk[1],_Pk[3],function(_Pl){var _Pm=E(_P9);return _Ou(_Pm[1],_Pm[3],_P4,_Pi,_Ph,_Pl);},function(_Pn){var _Po=E(_P9);return _Ou(_Po[1],_Po[3],_P4,_Pg,_Pf,_Pn);},_Pj);}]);}),function(_Pp){return !_sq(_Pp,_Pd)?E(_P6):E(_P7);}]);};},_Pq=new T(function(){return _P0(_Oe,_8O,_9L,_8F);}),_Pr=unCStr("yes"),_Ps=unCStr("no"),_Pt=new T(function(){return A(_Pq,[_ec,_Pr,_Ps]);}),_Pu=unCStr("ok"),_Pv=[1,_Pu],_Pw=new T(function(){return A(_yg,[_Pv]);}),_Px=new T(function(){return _t1(_Pw,_vf);}),_Py=function(_Pz,_){var _PA=A(_Pt,[_Pz,_]),_PB=E(_PA),_PC=E(_PB[1]),_PD=A(_Px,[_PB[2],_]),_PE=E(_PD);return [0,[0,function(_PF,_){var _PG=A(_O0,[_PF,_]),_PH=A(_PC[1],[_PF,_]),_PI=A(E(_PE[1])[1],[_PF,_]),_PJ=_5m(_PF,_);return _PF;},new T(function(){var _PK=E(_PC[2]);return _PK[0]==0?[0]:[1,[0,_PK[1]]];})],_PE[2]];},_PL=unCStr("do you study in "),_PM=new T(function(){return _5c(_4S,_PL);}),_PN=unCStr("University"),_PO=function(_K7){return _NF(_PN,_K7);},_PP=unCStr("High School"),_PQ=function(_K7){return _NF(_PP,_K7);},_PR=[1,_PQ,_g],_PS=[1,_PO,_PR],_PT=new T(function(){return A(_F3,[_PS]);}),_PU=function(_PV,_){var _PW=A(_PT,[_PV,_]),_PX=E(_PW),_PY=E(_PX[1]);return [0,[0,function(_PZ,_){var _Q0=A(_PM,[_PZ,_]),_Q1=A(_PY[1],[_PZ,_]);return _PZ;},new T(function(){var _Q2=E(_PY[2]);return _Q2[0]==0?[0]:[1,[1,_Q2[1]]];})],_PX[2]];},_Q3=new T(function(){return _aB("main.hs:(289,11)-(296,64)|case");}),_Q4=unCStr(" that you enjoy your work"),_Q5=unCStr("False"),_Q6=new T(function(){return _1G(_Q5,_Q4);}),_Q7=unCStr("True"),_Q8=new T(function(){return _1G(_Q7,_Q4);}),_Q9=[0,32],_Qa=function(_Qb,_Qc){var _Qd=new T(function(){return _4Z(_4S,new T(function(){return unAppCStr("You are ",new T(function(){return _1G(_Qb,[1,_Q9,_Qc]);}));}));});return function(_ci,_yY){return _4f(_NQ,function(_Qe){var _Qf=new T(function(){return !_sq(_Qe,_NJ)?!_sq(_Qe,_Nc)?E(_Q3):E(_Py):E(_PU);});return function(_ci,_yY){return _4f(_Qf,function(_Qg){return function(_Qh,_){var _Qi=A(new T(function(){var _Qj=E(_Qg);if(!_Qj[0]){var _Qk=new T(function(){return _4Z(_4S,new T(function(){return unAppCStr("You work and it is ",new T(function(){return !E(_Qj[1])?E(_Q6):E(_Q8);}));}));});return function(_Ql,_){return [0,[0,function(_Qm,_){var _Qn=A(_Qk,[_Qm,_]);return _Qm;},_9],_Ql];};}else{var _Qo=new T(function(){return _4Z(_4S,new T(function(){return unAppCStr("You study at the ",_Qj[1]);}));});return function(_Qp,_){return [0,[0,function(_Qq,_){var _Qr=A(_Qo,[_Qq,_]);return _Qq;},_9],_Qp];};}}),[_Qh,_]),_Qs=E(_Qi),_Qt=E(_Qs[1]);return [0,[0,function(_Qu,_){var _Qv=A(_Qd,[_Qu,_]),_Qw=A(_Qt[1],[_Qu,_]);return _Qu;},_Qt[2]],_Qs[2]];};},_ci,_yY);};},_ci,_yY);};},_Qx=function(_Qy){var _Qz=E(_Qy);return _Qa(_Qz[1],_Qz[2]);},_QA=unCStr("Who are you? "),_QB=new T(function(){return _4Z(_4S,_QA);}),_QC=unCStr("name"),_QD=unCStr("placeholder"),_QE=[0,_QD,_QC],_QF=[1,_QE,_g],_QG=unCStr("surname"),_QH=[0,_QD,_QG],_QI=[1,_QH,_g],_QJ=[1,_Pu],_QK=new T(function(){return A(_yg,[_QJ]);}),_QL=new T(function(){return _t1(_QK,_vf);}),_QM=new T(function(){return A(_MR,[_9,_9K,_9]);}),_QN=new T(function(){return A(_MR,[_9,_9K,_9]);}),_QO=function(_QP,_){var _QQ=A(_QN,[_QP,_]),_QR=E(_QQ),_QS=E(_QR[1]),_QT=A(_QM,[_QR[2],_]),_QU=E(_QT),_QV=E(_QU[1]),_QW=A(_QL,[_QU[2],_]),_QX=E(_QW),_QY=new T(function(){return _Q(_QV[1],_QI);}),_QZ=new T(function(){return _Q(_QS[1],_QF);});return [0,[0,function(_R0,_){var _R1=A(_QB,[_R0,_]),_R2=A(_QZ,[_R0,_]),_R3=_5m(_R0,_),_R4=A(_QY,[_R0,_]),_R5=_5m(_R0,_),_R6=A(E(_QX[1])[1],[_R0,_]),_R7=_5m(_R0,_);return _R0;},new T(function(){var _R8=E(_QS[2]);if(!_R8[0]){return [0];}else{var _R9=E(_QV[2]);return _R9[0]==0?[0]:[1,[0,_R8[1],_R9[1]]];}})],_QX[2]];},_Ra=unCStr("http://mflowdemo.herokuapp.com/noscript/monadicwidgets/combination"),_Rb=unCStr("This formulary is the same than the one "),_Rc=[0,97],_Rd=[1,_Rc,_g],_Re=function(_Rf,_Rg){var _Rh=new T(function(){return A(_Rf,[_Rg]);});return function(_Ri,_){var _Rj=jsCreateElem(toJSStr(_Rd)),_Rk=jsAppendChild(_Rj,E(_Ri)[1]),_Rl=[0,_Rj],_Rm=A(_Rh,[_Rl,_]);return _Rl;};},_Rn=unCStr("run in the server by MFlow"),_Ro=new T(function(){return _Re(_4S,_Rn);}),_Rp=unCStr("href"),_Rq=function(_Rr,_){var _Rs=_4S(_Rb,_Rr,_),_Rt=A(_Ro,[_Rr,_]),_Ru=A(_B,[_H,_Rt,_Rp,_Ra,_]);return _Rr;},_Rv=new T(function(){return _4Z(_uM,_Rq);}),_Rw=unCStr("Fields of a form appear in sequence. Some of the fields trigger events instantly. Some others use a button to trigger them. It also contains option buttons, radio buttons etc"),_Rx=new T(function(){return _4Z(_4S,_Rw);}),_Ry=function(_Rz,_){var _RA=_4f(_QO,_Qx,_Rz,_),_RB=E(_RA),_RC=E(_RB[1]);return [0,[0,function(_RD,_){var _RE=A(_Rx,[_RD,_]),_RF=A(_Rv,[_RD,_]),_RG=A(_RC[1],[_RD,_]);return _RD;},_RC[2]],_RB[2]];},_RH=unCStr("this example show a image gallery. It advances each 20 seconds and by pressing the button"),_RI=new T(function(){return _4Z(_4S,_RH);}),_RJ=[1,_5B],_RK=unCStr("GalleryIndex"),_RL=[0,I_fromBits([203033753,3200738202]),I_fromBits([3394053259,1065442867]),_z7,_z8,_RK],_RM=[0,I_fromBits([203033753,3200738202]),I_fromBits([3394053259,1065442867]),_RL,_g],_RN=function(_RO){return E(_RM);},_RP=new T(function(){return _BC(_13,_3x,_11,_RN);}),_RQ=function(_RR,_){var _RS=A(_RP,[_RR,_]);return [0,[0,_vb,new T(function(){var _RT=E(E(_RS)[1]);return _RT[0]==0?E(_RJ):E(_RT);})],new T(function(){return E(E(_RS)[2]);})];},_RU=unCStr("100%"),_RV=[0,62],_RW=[1,_RV,_g],_RX=[1,_RW],_RY=new T(function(){return A(_yg,[_RX]);}),_RZ=new T(function(){return _t1(_RY,_vf);}),_S0=function(_S1){return E(_RZ);},_S2=unCStr("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRAgKkpDyzk8kdIqk5ECsZ14XgbpBzyWFvrCrHombkSBAUn6jFo"),_S3=[1,_S2,_g],_S4=unCStr("https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcSfP70npv4FOrkBjScP0tVu2t3veSNoFQ6MMxX6LDO8kldNeu-DxQ"),_S5=[1,_S4,_S3],_S6=unCStr("https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcS53axpzkDyzEUAdaIP3YsaHuR-_YqN9qFK3W4bp_D2OBZfW5BU_Q"),_S7=[1,_S6,_S5],_S8=unCStr("https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcQ_ywj-zxDq3h_B4l48XHsjTywrdbK5egxvhxkYJ1HOkDFXd_-H"),_S9=[1,_S8,_S7],_Sa=unCStr("https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcQmmC4kV3NPFIpGL_x4H_iHG_p-c93DGjWfkxVtjxEFVng7A8o-nw"),_Sb=[1,_Sa,_S9],_Sc=unCStr("http://almaer.com/blog/uploads/interview-haskell.png"),_Sd=[1,_Sc,_Sb],_Se=unCStr("height"),_Sf=unCStr("img"),_Sg=function(_Sh,_){var _Si=jsCreateElem(toJSStr(E(_Sf))),_Sj=jsAppendChild(_Si,E(_Sh)[1]);return [0,_Si];},_Sk=function(_Sl,_Sm){while(1){var _Sn=E(_Sl);if(!_Sn[0]){return E(_Sm);}else{_Sl=_Sn[2];var _So=_Sm+1|0;_Sm=_So;continue;}}},_Sp=new T(function(){return [0,_Sk(_Sd,0)-1|0];}),_Sq=[0,_2X,_5q],_Sr=unCStr("src"),_Ss=unCStr("width"),_St=function(_Su){return function(_ci,_yY){return _4f(function(_Bf,_){return _4f(_B6,function(_Sv){return function(_Sw,_){return [0,_Sq,new T(function(){var _Sx=E(_Sv);return [0,_Sx[1],_Sx[2],_Sx[3],_Sx[4],_Sx[5],new T(function(){return _AT(I_fromBits([203033753,3200738202]),I_fromBits([3394053259,1065442867]),_RL,_g,new T(function(){var _Sy=E(_Su)[1];return _Sy!=E(_Sp)[1]?[0,_Sy+1|0]:E(_5B);}),_Sx[6]);})];})];};},_Bf,_);},function(_Sz,_Bf,_){return (function(_Bf,_){return _4f(function(_SA,_){return [0,[0,function(_SB,_){var _SC=_Sg(_SB,_),_SD=A(_B,[_H,_SC,_Sr,new T(function(){var _SE=E(_Su)[1];return _SE>=0?_w7(_Sd,_SE):E(_w4);}),_]),_SF=A(_B,[_H,_SC,_Ss,_RU,_]),_SG=A(_B,[_H,_SC,_Se,_RU,_]),_SH=_5m(_SB,_);return _SB;},_B8],_SA];},_S0,_Bf,_);})(_Bf,_);},_ci,_yY);};},_SI=function(_Bf,_){return _4f(_RQ,_St,_Bf,_);},_SJ=function(_SK,_SL,_){return _SM(_SL,_);},_SN=function(_Bf,_){return _yz(_SI,_SJ,_Bf,_);},_SO=[0,20000],_SP=new T(function(){return _3K(_13,_3x,_11,_Y);}),_SQ=function(_SR,_SS,_ST,_){var _SU=A(_SP,[_ST,_]),_SV=new T(function(){return E(E(_SU)[1]);}),_SW=new T(function(){return [0,_SX];}),_SX=function(_){var _SY=jsFind(toJSStr(E(_SV))),_SZ=E(_SY);if(!_SZ[0]){return _A;}else{var _T0=E(_SZ[1]),_T1=E(_T0),_T2=jsClearChildren(_T0[1]),_T3=E(_k)[1],_T4=takeMVar(_T3),_T5=A(_SS,[_T4,_]),_T6=E(_T5),_T7=E(_T6[1]),_T8=_T7[1],_T9=_T7[2],_=putMVar(_T3,new T(function(){var _Ta=E(_T6[2]);return [0,_Ta[1],_Ta[2],_Ta[3],_Ta[4],_0,_Ta[6]];}));if(!E(E(_T4)[5])){var _Tb=A(_T8,[_T1,_]),_Tc=E(_T9);if(!_Tc[0]){var _Td=jsSetTimeout(E(_SR)[1],E(_SW)[1]);return _A;}else{var _Te=E(_Tc[1]);return _A;}}else{var _Tf=A(_7,[E(_T1[1]),_]),_Tg=A(_T8,[[0,_Tf],_]),_Th=E(_T9);if(!_Th[0]){var _Ti=jsSetTimeout(E(_SR)[1],E(_SW)[1]);return _A;}else{var _Tj=E(_Th[1]);return _A;}}}},_Tk=jsSetTimeout(E(_SR)[1],E(_SW)[1]);return _ym(_SV,_SS,new T(function(){return E(E(_SU)[2]);}),_);},_SM=function(_Tl,_){var _Tm=_SQ(_SO,_SN,_Tl,_),_Tn=E(_Tm),_To=E(_Tn[1]);return [0,[0,function(_Tp,_){var _Tq=A(_RI,[_Tp,_]),_Tr=A(_To[1],[_Tp,_]);return _Tp;},_To[2]],_Tn[2]];},_Ts=function(_Tt){var _Tu=new T(function(){return _5c(_4S,new T(function(){return unAppCStr(" returns ",_Tt);}));});return function(_Tv,_){return [0,[0,_Tu,_B8],_Tv];};},_Tw=unCStr("This link say Hey!"),_Tx=function(_Bf,_){return _4S(_Tw,_Bf,_);},_Ty=unCStr("Hey!"),_Tz=function(_){var _=0,_TA=newMVar(),_=putMVar(_TA,_9);return [0,_TA];},_TB=new T(function(){return _2(_Tz);}),_TC=new T(function(){return _3K(_13,_3x,_11,_Y);}),_TD=new T(function(){return A(_oS,[_6H]);}),_TE=function(_TF,_TG,_){var _=putMVar(E(_TF)[1],_TG);return _A;},_TH=function(_TI,_TJ,_){return _s8(function(_){return _TE(_TB,_TI,_);},_TJ,_);},_TK=function(_){var _TL=E(_TB)[1],_TM=takeMVar(_TL),_=putMVar(_TL,_TM);return _TM;},_TN=function(_TO,_TP,_TQ,_TR){var _TS=new T(function(){return _Re(_uM,_TR);}),_TT=new T(function(){return unAppCStr("#/",new T(function(){var _TU=A(_TP,[_TQ]),_TV=E(_TD),_TW=hs_eqWord64(_TU[1],_TV[1]);if(!E(_TW)){return A(_qW,[_TO,_TQ]);}else{var _TX=hs_eqWord64(_TU[2],_TV[2]);return E(_TX)==0?A(_qW,[_TO,_TQ]):E(_TQ);}}));});return function(_TY,_){var _TZ=A(_TC,[_TY,_]),_U0=0,_U1=function(_,_U2,_U3){var _U4=new T(function(){return E(E(_TZ)[1]);}),_U5=function(_U6,_){var _U7=A(_TS,[_U6,_]),_U8=A(_B,[_H,_U7,_Rp,_TT,_]),_U9=E(_U7),_Ua=jsSetCB(_U9[1],E(_sH)[1],E([0,function(_Ub,_Uc,_){return (function(_){var _Ud=0;if(!E(_Ud)){return (function(_){var _Ue=takeMVar(E(_TB)[1]),_Uf=jsCatch(function(_){return (function(_){return [1,_U4];})();},function(_X,_){return _TH(_Ue,_X,_);});return _TE(_TB,_Uf,_);})();}else{var _Ug=takeMVar(E(_TB)[1]),_Uh=jsCatch(function(_){return [1,_U4];},function(_X,_){return _TH(_Ug,_X,_);});return _TE(_TB,_Uh,_);}})(_);}])[1]);return _U9;},_Ui=E(_U2);return _Ui[0]==0?[0,[0,_U5,_9],_U3]:!_sq(_Ui[1],_U4)?[0,[0,_U5,_9],_U3]:[0,[0,_U5,[1,_TQ]],_U3];};if(!E(_U0)){var _Uj=_TK();return _U1(_,_Uj,new T(function(){return E(E(_TZ)[2]);}));}else{var _Uk=E(_TB)[1],_Ul=takeMVar(_Uk),_=putMVar(_Uk,_Ul);return _U1(_,_Ul,new T(function(){return E(E(_TZ)[2]);}));}};},_Um=new T(function(){return _TN(_E7,_E6,_Ty,_Tx);}),_Un=new T(function(){return _t1(_Um,_vf);}),_Uo=function(_Up,_){var _Uq=A(_Un,[_Up,_]),_Ur=E(_Uq),_Us=E(_Ur[1]);return [0,[0,function(_Ut,_){var _Uu=_5m(_Ut,_),_Uv=A(_Us[1],[_Ut,_]);return _Ut;},_Us[2]],_Ur[2]];},_Uw=function(_){var _Ux=E(_s7)[1],_Uy=takeMVar(_Ux),_=putMVar(_Ux,_Uy);return _Uy;},_Uz=function(_UA,_){var _UB=0;if(!E(_UB)){var _UC=_Uw();return [0,[0,_2X,[1,_UC]],_UA];}else{var _UD=E(_s7)[1],_UE=takeMVar(_UD),_=putMVar(_UD,_UE);return [0,[0,_2X,[1,_UE]],_UA];}},_UF=function(_UG,_UH,_UI){return A(_UG,[[1,_2t,new T(function(){return A(_UH,[_UI]);})]]);},_UJ=unCStr("Key "),_UK=unCStr("Mouse "),_UL=unCStr("Click "),_UM=unCStr("NoData"),_UN=function(_UO){return _1G(_UM,_UO);},_UP=unCStr(": empty list"),_UQ=unCStr("Prelude."),_UR=function(_US){return err(_1G(_UQ,new T(function(){return _1G(_US,_UP);})));},_UT=unCStr("foldr1"),_UU=new T(function(){return _UR(_UT);}),_UV=function(_UW,_UX){var _UY=E(_UX);if(!_UY[0]){return E(_UU);}else{var _UZ=_UY[1],_V0=E(_UY[2]);return _V0[0]==0?E(_UZ):A(_UW,[_UZ,new T(function(){return _UV(_UW,_V0);})]);}},_V1=[0,32],_V2=function(_V3,_V4){var _V5=E(_V4);switch(_V5[0]){case 0:return E(_UN);case 1:var _V6=function(_V7){return _3F(11,E(_V5[1])[1],[1,_V1,new T(function(){var _V8=E(_V5[2]);return [1,_3E,new T(function(){return A(_UV,[_UF,[1,function(_V9){return _3F(0,E(_V8[1])[1],_V9);},[1,function(_Va){return _3F(0,E(_V8[2])[1],_Va);},_g]],[1,_3D,_V7]]);})];})]);};return E(_V3)[1]<11?function(_Vb){return _1G(_UL,new T(function(){return _V6(_Vb);}));}:function(_Vc){return [1,_3E,new T(function(){return _1G(_UL,new T(function(){return _V6([1,_3D,_Vc]);}));})];};case 2:var _Vd=function(_Ve){return _1G(_UK,new T(function(){var _Vf=E(_V5[1]);return [1,_3E,new T(function(){return A(_UV,[_UF,[1,function(_Vg){return _3F(0,E(_Vf[1])[1],_Vg);},[1,function(_Vh){return _3F(0,E(_Vf[2])[1],_Vh);},_g]],[1,_3D,_Ve]]);})];}));};return E(_V3)[1]<11?E(_Vd):function(_Vi){return [1,_3E,new T(function(){return _Vd([1,_3D,_Vi]);})];};default:var _Vj=_V5[1];return E(_V3)[1]<11?function(_Vk){return _1G(_UJ,new T(function(){return _3F(11,E(_Vj)[1],_Vk);}));}:function(_Vl){return [1,_3E,new T(function(){return _1G(_UJ,new T(function(){return _3F(11,E(_Vj)[1],[1,_3D,_Vl]);}));})];};}},_Vm=function(_Vn){var _Vo=new T(function(){return _4Z(_4S,new T(function(){var _Vp=E(_Vn);return _1G(_Vp[1],[1,_Q9,new T(function(){return A(_V2,[_oW,_Vp[2],_g]);})]);}));});return function(_Vq,_){return [0,[0,_Vo,_B8],_Vq];};},_Vr=function(_Bf,_){return _4f(_Uz,_Vm,_Bf,_);},_Vs=function(_Vt){return E(_Vr);},_Vu=[14,coercionToken],_Vv=[12,coercionToken],_Vw=[9,coercionToken],_Vx=[11,coercionToken],_Vy=[5,coercionToken],_Vz=[10,coercionToken],_VA=[6,coercionToken],_VB=[7,coercionToken],_VC=unCStr("height:100px;background-color:lightgreen;position:relative"),_VD=unCStr("div"),_VE=function(_VF,_VG){var _VH=new T(function(){return A(_VF,[_VG]);});return function(_VI,_){var _VJ=jsCreateElem(toJSStr(E(_VD))),_VK=jsAppendChild(_VJ,E(_VI)[1]),_VL=[0,_VJ],_VM=A(_VH,[_VL,_]);return _VL;};},_VN=unCStr("h1"),_VO=function(_VP,_VQ){var _VR=new T(function(){return A(_VP,[_VQ]);});return function(_VS,_){var _VT=jsCreateElem(toJSStr(E(_VN))),_VU=jsAppendChild(_VT,E(_VS)[1]),_VV=[0,_VT],_VW=A(_VR,[_VV,_]);return _VV;};},_VX=unCStr("Mouse events here"),_VY=new T(function(){return _VO(_4S,_VX);}),_VZ=new T(function(){return _VE(_uM,_VY);}),_W0=function(_W1,_){var _W2=A(_VZ,[_W1,_]),_W3=A(_B,[_H,_W2,_CA,_VC,_]);return _W2;},_W4=[0,_W0,_B8],_W5=function(_W6,_){return [0,_W4,_W6];},_W7=new T(function(){return _t1(_W5,_VB);}),_W8=new T(function(){return _t1(_W7,_VA);}),_W9=new T(function(){return _t1(_W8,_Vz);}),_Wa=new T(function(){return _t1(_W9,_Vy);}),_Wb=new T(function(){return _t1(_Wa,_Vx);}),_Wc=new T(function(){return _t1(_Wb,_vf);}),_Wd=new T(function(){return _t1(_Wc,_Vw);}),_We=new T(function(){return _t1(_Wd,_Vv);}),_Wf=new T(function(){return _t1(_We,_Vu);}),_Wg=new T(function(){return _t1(_Wf,_9J);}),_Wh=unCStr("http://todomvc.com"),_Wi=unCStr("Work in progress for a todo application to be added to "),_Wj=unCStr("todomvc.com"),_Wk=new T(function(){return _Re(_4S,_Wj);}),_Wl=function(_Wm,_){var _Wn=_4S(_Wi,_Wm,_),_Wo=A(_Wk,[_Wm,_]),_Wp=A(_B,[_H,_Wo,_Rp,_Wh,_]);return _Wm;},_Wq=new T(function(){return _4Z(_uM,_Wl);}),_Wr=unCStr("Tasks"),_Ws=[0,I_fromBits([3561938990,657451105]),I_fromBits([3021302870,108592267]),_z7,_z8,_Wr],_Wt=2,_Wu=function(_Wv,_Ww,_Wx,_Wy,_){var _Wz=A(_Wx,[_Wy,_]),_WA=E(_Wz),_WB=E(_WA[1]),_WC=_WB[1];return [0,[0,function(_WD,_){var _WE=jsFind(toJSStr(E(_Wv))),_WF=E(_WE);if(!_WF[0]){return _WD;}else{var _WG=_WF[1];switch(E(_Ww)){case 0:var _WH=A(_WC,[_WG,_]);return _WD;case 1:var _WI=E(_WG),_WJ=_WI[1],_WK=jsGetChildren(_WJ),_WL=E(_WK);if(!_WL[0]){var _WM=A(_WC,[_WI,_]);return _WD;}else{var _WN=jsCreateElem(toJSStr(E(_3X))),_WO=jsAddChildBefore(_WN,_WJ,E(_WL[1])[1]),_WP=A(_WC,[[0,_WN],_]);return _WD;}break;default:var _WQ=E(_WG),_WR=jsClearChildren(_WQ[1]),_WS=A(_WC,[_WQ,_]);return _WD;}}},_WB[2]],_WA[2]];},_WT=[0,_2X,_5q],_WU=function(_WV,_){return [0,_WT,_WV];},_WW=unCStr("Pattern match failure in do expression at main.hs:345:7-25"),_WX=new T(function(){return _Oc(_WW);}),_WY=function(_WZ,_X0,_X1,_X2){return A(_WZ,[new T(function(){return function(_){var _X3=jsSet(E(_X0)[1],toJSStr(E(_X1)),toJSStr(E(_X2)));return _A;};})]);},_X4=unCStr("text"),_X5=unCStr("value"),_X6=new T(function(){return _6I(_oL,_oQ);}),_X7=new T(function(){return A(_X6,[_6H]);}),_X8=new T(function(){return A(_X6,[_6H]);}),_X9=unCStr("Prelude.read: ambiguous parse"),_Xa=unCStr("Prelude.read: no parse"),_Xb=function(_Xc){return [1,function(_Xd){return A(_kx,[_Xd,function(_Xe){return E([3,_Xc,_bO]);}]);}];},_Xf=function(_Xg){while(1){var _Xh=(function(_Xi){var _Xj=E(_Xi);if(!_Xj[0]){return [0];}else{var _Xk=_Xj[2],_Xl=E(_Xj[1]);if(!E(_Xl[2])[0]){return [1,_Xl[1],new T(function(){return _Xf(_Xk);})];}else{_Xg=_Xk;return null;}}})(_Xg);if(_Xh!=null){return _Xh;}}},_Xm=function(_Xn,_Xo){var _Xp=_Xf(_aE(A(E(_Xn)[3],[_mO,_Xb]),_Xo));return _Xp[0]==0?err(_Xa):E(_Xp[2])[0]==0?E(_Xp[1]):err(_X9);},_Xq=function(_Xr,_Xs,_Xt,_Xu){var _Xv=new T(function(){return _qW(_Xs);}),_Xw=new T(function(){return _qY(_8F,_9L,_Xt,_Xs,_Xr);});return [0,function(_Xx){return A(_Xw,[[1,_Xu],_X4,_Xx]);},function(_Xy,_){var _Xz=E(_Xu),_XA=jsFind(toJSStr(_Xz)),_XB=E(_XA);return _XB[0]==0?_45(_Xz):A(_WY,[_H,_XB[1],_X5,new T(function(){var _XC=A(_Xt,[_Xy]),_XD=E(_X7),_XE=hs_eqWord64(_XC[1],_XD[1]);if(!E(_XE)){return A(_Xv,[_Xy]);}else{var _XF=hs_eqWord64(_XC[2],_XD[2]);return E(_XF)==0?A(_Xv,[_Xy]):E(_Xy);}}),_]);},function(_){var _XG=E(_Xu),_XH=jsFind(toJSStr(_XG)),_XI=E(_XH);if(!_XI[0]){return _45(_XG);}else{var _XJ=_Df(E(_XI[1])[1],_X5,_);return new T(function(){var _XK=A(_X6,[_XJ]),_XL=E(_X8),_XM=hs_eqWord64(_XK[1],_XL[1]);if(!E(_XM)){return _Xm(_Xr,_XJ);}else{var _XN=hs_eqWord64(_XK[2],_XL[2]);return E(_XN)==0?_Xm(_Xr,_XJ):E(_XJ);}});}}];},_XO=unCStr("todo"),_XP=new T(function(){var _XQ=_Xq(_GQ,_E7,_E6,_XO);return [0,_XQ[1],_XQ[2],_XQ[3]];}),_XR=new T(function(){var _XS=A(E(_XP)[2],[_g]);return function(_XT,_){var _XU=A(_XS,[_]);return [0,[0,_2X,[1,_XU]],_XT];};}),_XV=[1,_g],_XW=[0,I_fromBits([3561938990,657451105]),I_fromBits([3021302870,108592267]),_Ws,_g],_XX=function(_XY){return E(_XW);},_XZ=new T(function(){return _BC(_13,_3x,_11,_XX);}),_Y0=function(_Y1,_){var _Y2=A(_XZ,[_Y1,_]);return [0,[0,_vb,new T(function(){var _Y3=E(E(_Y2)[1]);return _Y3[0]==0?E(_XV):E(_Y3);})],new T(function(){return E(E(_Y2)[2]);})];},_Y4=[0,_2X,_5q],_Y5=[0,_2X,_5q],_Y6=function(_Y7,_Y8,_){return [0,_Y5,_Y8];},_Y9=[0,_2X,_5q],_Ya=function(_Yb,_){return [0,_Y9,_Yb];},_Yc=unCStr("list"),_Yd=unCStr("check"),_Ye=new T(function(){return A(_FM,[_0,_Yd]);}),_Yf=new T(function(){return _t1(_Ye,_vf);}),_Yg=function(_Yh,_){var _Yi=A(_Yf,[_Yh,_]),_Yj=E(_Yi),_Yk=E(_Yj[1]);return [0,[0,_Yk[1],new T(function(){var _Yl=E(_Yk[2]);return _Yl[0]==0?[0]:[1,E(_Yl[1])[1]];})],_Yj[2]];},_Ym=unCStr("text-decoration:line-through;"),_Yn=unCStr("li"),_Yo=function(_Yp,_Yq){var _Yr=new T(function(){return A(_Yp,[_Yq]);});return function(_Ys,_){var _Yt=jsCreateElem(toJSStr(E(_Yn))),_Yu=jsAppendChild(_Yt,E(_Ys)[1]),_Yv=[0,_Yt],_Yw=A(_Yr,[_Yv,_]);return _Yv;};},_Yx=function(_Yy){var _Yz=E(_Yy);if(!_Yz[0]){return [0];}else{var _YA=new T(function(){return _5c(_4S,_Yz[1]);});return [1,function(_YB,_){var _YC=_4f(_Yg,function(_YD){var _YE=E(_YD);return _YE[0]==0?function(_YF,_){return [0,[0,_YA,_B8],_YF];}:!_sq(_YE[1],_Yd)?function(_YG,_){return [0,[0,_YA,_B8],_YG];}:E(_YE[2])[0]==0?function(_YH,_){return [0,[0,function(_YI,_){var _YJ=A(_YA,[_YI,_]),_YK=A(_B,[_H,_YJ,_CA,_Ym,_]);return _YJ;},_B8],_YH];}:function(_YL,_){return [0,[0,_YA,_B8],_YL];};},_YB,_),_YM=E(_YC),_YN=E(_YM[1]);return [0,[0,new T(function(){return _Yo(_uM,_YN[1]);}),_YN[2]],_YM[2]];},new T(function(){return _Yx(_Yz[2]);})];}},_YO=function(_YP,_YQ){while(1){var _YR=(function(_YS,_YT){var _YU=E(_YT);if(!_YU[0]){return E(_YS);}else{_YP=function(_YV,_){var _YW=A(_YS,[_YV,_]),_YX=E(_YW),_YY=E(_YX[1]),_YZ=A(_YU[1],[_YX[2],_]),_Z0=E(_YZ),_Z1=E(_Z0[1]);return [0,[0,function(_Z2,_){var _Z3=A(_YY[1],[_Z2,_]),_Z4=A(_Z1[1],[_Z2,_]);return _Z2;},new T(function(){var _Z5=E(_YY[2]);return _Z5[0]==0?E(_Z1[2]):E(_Z5);})],_Z0[2]];};_YQ=_YU[2];return null;}})(_YP,_YQ);if(_YR!=null){return _YR;}}},_Z6=function(_Z7,_Z8,_){return _4f(_Uz,function(_Z9){var _Za=E(E(_Z9)[2]);return _Za[0]==3?E(E(_Za[1])[1])==13?function(_Bf,_){return _4f(_XR,function(_Zb){return function(_Bf,_){return _4f(_Y0,function(_Zc){var _Zd=new T(function(){return _YO(_Ya,_Yx([1,_Z7,_Zc]));});return function(_ci,_yY){return _4f(function(_Bf,_){return _4f(_B6,function(_Ze){return function(_Zf,_){return [0,_Y4,new T(function(){var _Zg=E(_Ze);return [0,_Zg[1],_Zg[2],_Zg[3],_Zg[4],_Zg[5],new T(function(){return _AT(I_fromBits([3561938990,657451105]),I_fromBits([3021302870,108592267]),_Ws,_g,[1,_Z7,_Zc],_Zg[6]);})];})];};},_Bf,_);},function(_Zh,_Bf,_){return (function(_Bf,_){return _4f(function(_Bf,_){return _Wu(_Yc,_Wt,_Zd,_Bf,_);},_Y6,_Bf,_);})(_Bf,_);},_ci,_yY);};},_Bf,_);};},_Bf,_);}:E(_WU):E(_WX);},_Z8,_);},_Zi=new T(function(){return A(E(_XP)[1],[_9]);}),_Zj=new T(function(){return _t1(_Zi,_9J);}),_Zk=unCStr("todos"),_Zl=new T(function(){return _VO(_4S,_Zk);}),_Zm=new T(function(){return _VE(_uM,_2X);}),_Zn=function(_Zo,_){var _Zp=_4f(_Zj,_Z6,_Zo,_),_Zq=E(_Zp),_Zr=E(_Zq[1]),_Zs=new T(function(){return _v2(_uM,function(_Zt,_){var _Zu=A(_Zl,[_Zt,_]),_Zv=A(_Zr[1],[_Zt,_]);return _Zt;});});return [0,[0,function(_Zw,_){var _Zx=A(_Zs,[_Zw,_]),_Zy=A(_Zm,[_Zw,_]),_Zz=A(_B,[_H,_Zy,_IU,_Yc,_]);return _Zw;},new T(function(){var _ZA=E(_Zr[2]);return _ZA[0]==0?E(_B8):E(_ZA);})],_Zq[2]];},_ZB=function(_ZC,_ZD,_){return [0,[0,_2X,[1,[1,_ZC]]],_ZD];},_ZE=unCStr("revEntry"),_ZF=new T(function(){var _ZG=_Xq(_GQ,_E7,_E6,_ZE);return [0,_ZG[1],_ZG[2],_ZG[3]];}),_ZH=new T(function(){return A(E(_ZF)[1],[_9]);}),_ZI=new T(function(){return _t1(_ZH,_9J);}),_ZJ=function(_ZK,_ZL,_){return [0,[0,_2X,[1,[0,_ZK]]],_ZL];},_ZM=unCStr("entry"),_ZN=new T(function(){var _ZO=_Xq(_GQ,_E7,_E6,_ZM);return [0,_ZO[1],_ZO[2],_ZO[3]];}),_ZP=new T(function(){return A(E(_ZN)[1],[_9]);}),_ZQ=new T(function(){return _t1(_ZP,_9J);}),_ZR=function(_ZS,_){var _ZT=_4f(_ZQ,_ZJ,_ZS,_),_ZU=E(_ZT),_ZV=E(_ZU[1]),_ZW=_4f(_ZI,_ZB,_ZU[2],_),_ZX=E(_ZW),_ZY=E(_ZX[1]);return [0,[0,new T(function(){return _v2(_uM,function(_ZZ,_){var _100=A(_ZV[1],[_ZZ,_]),_101=_5m(_ZZ,_),_102=A(_ZY[1],[_ZZ,_]);return _ZZ;});}),new T(function(){var _103=E(_ZV[2]);return _103[0]==0?E(_ZY[2]):E(_103);})],_ZX[2]];},_104=unCStr("To search palindromes: one box present the other\'s reversed. It is also an example of cell usage"),_105=new T(function(){return _4Z(_4S,_104);}),_106=function(_107){var _108=A(E(_ZF)[2],[_107]);return function(_109,_){var _10a=A(_108,[_]);return [0,[0,_2X,[1,_10a]],_109];};},_10b=function(_10c,_10d){while(1){var _10e=E(_10c);if(!_10e[0]){return E(_10d);}else{_10c=_10e[2];var _10f=[1,_10e[1],_10d];_10d=_10f;continue;}}},_10g=function(_10h){var _10i=new T(function(){return _10b(_10h,_g);});return function(_10j,_){return [0,[0,_2X,[1,_10i]],_10j];};},_10k=new T(function(){var _10l=E(E(_ZN)[3]);return function(_10m,_){var _10n=A(_10l,[_]);return [0,[0,_2X,[1,_10n]],_10m];};}),_10o=function(_Bf,_){return _4f(_10k,_10g,_Bf,_);},_10p=function(_Bf,_){return _4f(_10o,_106,_Bf,_);},_10q=function(_10r){var _10s=A(E(_ZN)[2],[_10r]);return function(_10t,_){var _10u=A(_10s,[_]);return [0,[0,_2X,[1,_10u]],_10t];};},_10v=new T(function(){var _10w=E(E(_ZF)[3]);return function(_10x,_){var _10y=A(_10w,[_]);return [0,[0,_2X,[1,_10y]],_10x];};}),_10z=function(_10A){var _10B=new T(function(){return _10b(_10A,_g);});return function(_10C,_){return [0,[0,_2X,[1,_10B]],_10C];};},_10D=function(_Bf,_){return _4f(_10v,_10z,_Bf,_);},_10E=function(_Bf,_){return _4f(_10D,_10q,_Bf,_);},_10F=function(_10G){return E(_10G)[0]==0?E(_10p):E(_10E);},_10H=function(_10I,_){var _10J=_4f(_ZR,_10F,_10I,_),_10K=E(_10J),_10L=E(_10K[1]);return [0,[0,function(_10M,_){var _10N=A(_105,[_10M,_]),_10O=A(_10L[1],[_10M,_]);return _10M;},_10L[2]],_10K[2]];},_10P=unCStr("This widget sum recursively n numbers, but remember the previos entries when one entry is edited"),_10Q=new T(function(){return _4Z(_4S,_10P);}),_10R=[0,_2X,_9],_10S=function(_10T,_){return [0,_10R,_10T];},_10U=function(_10V,_10W,_10X){var _10Y=E(_10V),_10Z=_10Y[1],_110=_10Y[2],_111=_10Y[3],_112=_10Y[4],_113=E(_10X);if(!_113[0]){var _114=_113[2],_115=_113[3],_116=_113[4],_117=_113[5];switch(_zm(_10Y,_114)){case 0:return _zz(_114,_115,_AT(_10Z,_110,_111,_112,_10W,_116),_117);case 1:return [0,_113[1],E(_10Y),_10W,E(_116),E(_117)];default:return _Ae(_114,_115,_116,_AT(_10Z,_110,_111,_112,_10W,_117));}}else{return [0,1,E(_10Y),_10W,E(_f),E(_f)];}},_118=function(_119,_11a,_11b){var _11c=E(_11b);if(!_11c[0]){var _11d=_11c[3],_11e=_11c[4],_11f=_11c[5],_11g=E(_11c[2]),_11h=_11g[1];return _119>=_11h?_119!=_11h?_Ae(_11g,_11d,_11e,_118(_119,_11a,_11f)):[0,_11c[1],E([0,_119]),_11a,E(_11e),E(_11f)]:_zz(_11g,_11d,_118(_119,_11a,_11e),_11f);}else{return [0,1,E([0,_119]),_11a,E(_f),E(_f)];}},_11i=function(_11j,_11k,_11l){var _11m=E(_11j),_11n=_11m[1],_11o=E(_11l);if(!_11o[0]){var _11p=_11o[3],_11q=_11o[4],_11r=_11o[5],_11s=E(_11o[2]),_11t=_11s[1];return _11n>=_11t?_11n!=_11t?_Ae(_11s,_11p,_11q,_118(_11n,_11k,_11r)):[0,_11o[1],E(_11m),_11k,E(_11q),E(_11r)]:_zz(_11s,_11p,_118(_11n,_11k,_11q),_11r);}else{return [0,1,E(_11m),_11k,E(_f),E(_f)];}},_11u=function(_11v,_11w){while(1){var _11x=E(_11w);if(!_11x[0]){var _11y=E(_11x[2])[1];if(_11v>=_11y){if(_11v!=_11y){_11w=_11x[5];continue;}else{return [1,_11x[3]];}}else{_11w=_11x[4];continue;}}else{return [0];}}},_11z=unCStr("containers-0.5.5.1"),_11A=unCStr("Data.Map.Base"),_11B=unCStr("Map"),_11C=[0,I_fromBits([2800860092,98171937]),I_fromBits([2262449324,1391410843]),_11z,_11A,_11B],_11D=[0,I_fromBits([2800860092,98171937]),I_fromBits([2262449324,1391410843]),_11C,_g],_11E=function(_11F){return E(_11D);},_11G=function(_11H){var _11I=E(_11H);if(!_11I[0]){return [0];}else{var _11J=E(_11I[1]);return [1,[0,_11J[1],_11J[2]],new T(function(){return _11G(_11I[2]);})];}},_11K=function(_11L,_11M){return function(_11N){return E(new T(function(){var _11O=A(_11L,[_6H]),_11P=E(_11O[3]),_11Q=_11P[1],_11R=_11P[2],_11S=_1G(_11O[4],[1,new T(function(){return A(_11M,[_6H]);}),_g]);if(!_11S[0]){return [0,_11Q,_11R,_11P,_g];}else{var _11T=_6c(new T(function(){return _60(_6o(_6z,[1,[0,_11Q,_11R],new T(function(){return _11G(_11S);})]));}));return [0,_11T[1],_11T[2],_11P,_11S];}}));};},_11U=new T(function(){return _11K(_11E,_oj);}),_11V=new T(function(){return _6I(_11U,_oj);}),_11W=new T(function(){return _BC(_13,_3x,_11,_11V);}),_11X=function(_11Y,_){var _11Z=A(_11W,[_11Y,_]);return [0,[0,_2X,new T(function(){return E(E(_11Z)[1]);})],new T(function(){return E(E(_11Z)[2]);})];},_120=new T(function(){return _6I(_11U,_oj);}),_121=[1,_f],_122=new T(function(){return _BC(_13,_3x,_11,_120);}),_123=function(_124,_){var _125=A(_122,[_124,_]);return [0,[0,_vb,new T(function(){var _126=E(E(_125)[1]);return _126[0]==0?E(_121):E(_126);})],new T(function(){return E(E(_125)[2]);})];},_127=[0,_2X,_5q],_128=[1,_9],_129=function(_12a,_12b){var _12c=new T(function(){return [0,E(_12a)[1]+1|0];});return function(_ci,_yY){return _4f(function(_Bf,_){return _4f(function(_12d,_){var _12e=_4f(_11X,function(_12f){var _12g=_11u(E(_12a)[1],_12f);return _12g[0]==0?E(_10S):function(_12h,_){return [0,[0,_2X,_12g],_12h];};},_12d,_),_12i=E(_12e),_12j=E(_12i[1]);return [0,[0,function(_12k,_){var _12l=A(_12j[1],[_12k,_]);return _12k;},new T(function(){var _12m=E(_12j[2]);return _12m[0]==0?E(_128):[1,_12m];})],_12i[2]];},function(_12n){var _12o=new T(function(){return _t1(new T(function(){return A(_rJ,[_9,_9K,_12n]);}),_9J);});return function(_ci,_yY){return _4f(function(_12p,_){var _12q=A(_12o,[_12p,_]),_12r=E(_12q),_12s=_12r[2],_12t=E(_12r[1]),_12u=_12t[1],_12v=_12t[2],_12w=E(_12n);return _12w[0]==0?[0,[0,function(_12x,_){var _12y=A(_12u,[_12x,_]);return _12x;},_12v],_12s]:[0,[0,function(_12z,_){var _12A=A(_12u,[_12z,_]);return _12z;},new T(function(){var _12B=E(_12v);return _12B[0]==0?E(_12w):E(_12B);})],_12s];},function(_12C,_12D,_){return _4f(function(_Bf,_){return _4f(_123,function(_12E){var _12F=new T(function(){return _11i(_12a,_12C,_12E);}),_12G=new T(function(){return A(_120,[_12F]);});return function(_ci,_yY){return _4f(_B6,function(_12H){return function(_12I,_){return [0,_127,new T(function(){var _12J=E(_12H);return [0,_12J[1],_12J[2],_12J[3],_12J[4],_12J[5],new T(function(){return _10U(_12G,_12F,_12J[6]);})];})];};},_ci,_yY);};},_Bf,_);},function(_12K,_Bf,_){return (function(_12L,_){return [0,[0,_2X,[1,_12C]],_12L];})(_Bf,_);},_12D,_);},_ci,_yY);};},_Bf,_);},function(_12M){var _12N=new T(function(){return _129(_12c,new T(function(){return _8U(_12b,_12M);}));}),_12O=new T(function(){return _5c(_4S,new T(function(){return _3F(0,E(_12b)[1]+E(_12M)[1]|0,_g);}));});return function(_ci,_yY){return _4f(function(_12P,_){return [0,[0,function(_12Q,_){var _12R=A(_12O,[_12Q,_]),_12S=_5m(_12Q,_);return _12Q;},_5q],_12P];},function(_12T){return E(_12N);},_ci,_yY);};},_ci,_yY);};},_12U=new T(function(){return _129(_5B,_5B);}),_12V=unCStr("This widget sum recursively n numbers. When enters 0, present the result"),_12W=new T(function(){return _4Z(_4S,_12V);}),_12X=new T(function(){return A(_rJ,[_9,_9K,_9]);}),_12Y=new T(function(){return _t1(_12X,_9J);}),_12Z=function(_130){var _131=new T(function(){return _5c(_4S,new T(function(){return _58(_130);}));});return function(_ci,_yY){return _4f(_12Y,function(_132){var _133=E(E(_132)[1]);if(!_133){return function(_134,_){return [0,[0,function(_135,_){var _136=_5m(_135,_),_137=_4S(_5r,_135,_),_138=A(_131,[_135,_]);return _135;},_9],_134];};}else{var _139=new T(function(){return _12Z(new T(function(){return [0,E(_130)[1]+_133|0];}));}),_13a=new T(function(){return _5c(_4S,new T(function(){return _3F(0,E(_130)[1]+_133|0,_g);}));});return function(_ci,_yY){return _4f(function(_13b,_){return [0,[0,function(_13c,_){var _13d=A(_13a,[_13c,_]),_13e=_5m(_13c,_);return _13c;},_5q],_13b];},function(_13f){return E(_139);},_ci,_yY);};}},_ci,_yY);};},_13g=new T(function(){return _12Z(_5B);}),_13h=unCStr("This widget sum two numbers and append the result. Using applicative and monadic expressions"),_13i=new T(function(){return _4Z(_4S,_13h);}),_13j=function(_13k){return function(_13l,_){return [0,[0,new T(function(){var _13m=new T(function(){return _5c(_4S,new T(function(){return _58(_13k);}));});return _4Z(_uM,function(_13n,_){var _13o=_4S(_5r,_13n,_),_13p=A(_13m,[_13n,_]);return _13n;});}),_5q],_13l];};},_13q=new T(function(){return A(_rJ,[_9,_9K,_9]);}),_13r=new T(function(){return _t1(_13q,_9J);}),_13s=unCStr("second number "),_13t=unCStr("first number"),_13u=new T(function(){return A(_rJ,[_9,_9K,_9]);}),_13v=new T(function(){return _t1(_13u,_9J);}),_13w=function(_13x,_){var _13y=A(_13r,[_13x,_]),_13z=E(_13y),_13A=E(_13z[1]),_13B=A(_13v,[_13z[2],_]),_13C=E(_13B),_13D=E(_13C[1]);return [0,[0,function(_13E,_){var _13F=_4S(_13t,_13E,_),_13G=_5m(_13E,_),_13H=A(_13A[1],[_13E,_]),_13I=_5m(_13E,_),_13J=_4S(_13s,_13E,_),_13K=_5m(_13E,_),_13L=A(_13D[1],[_13E,_]),_13M=_5m(_13E,_);return _13E;},new T(function(){var _13N=E(_13A[2]);if(!_13N[0]){return [0];}else{var _13O=E(_13D[2]);return _13O[0]==0?[0]:[1,new T(function(){return _8U(_13N[1],_13O[1]);})];}})],_13C[2]];},_13P=function(_13Q,_){var _13R=_4f(_13w,_13j,_13Q,_),_13S=E(_13R),_13T=E(_13S[1]),_13U=new T(function(){return _4Z(_uM,_13T[1]);});return [0,[0,function(_13V,_){var _13W=A(_13i,[_13V,_]),_13X=A(_13U,[_13V,_]);return _13V;},_13T[2]],_13S[2]];},_13Y=unCStr("table"),_13Z=function(_140,_141){var _142=new T(function(){return A(_140,[_141]);});return function(_143,_){var _144=jsCreateElem(toJSStr(E(_13Y))),_145=jsAppendChild(_144,E(_143)[1]),_146=[0,_144],_147=A(_142,[_146,_]);return _146;};},_148=unCStr("hplayground examples"),_149=new T(function(){return _VO(_4S,_148);}),_14a=unCStr("td"),_14b=function(_14c,_14d){var _14e=new T(function(){return A(_14c,[_14d]);});return function(_14f,_){var _14g=jsCreateElem(toJSStr(E(_14a))),_14h=jsAppendChild(_14g,E(_14f)[1]),_14i=[0,_14g],_14j=A(_14e,[_14i,_]);return _14i;};},_14k=unCStr("tr"),_14l=function(_14m,_14n){var _14o=new T(function(){return A(_14m,[_14n]);});return function(_14p,_){var _14q=jsCreateElem(toJSStr(E(_14k))),_14r=jsAppendChild(_14q,E(_14p)[1]),_14s=[0,_14q],_14t=A(_14o,[_14s,_]);return _14s;};},_14u=unCStr("bottom of the page"),_14v=new T(function(){return _5c(_4S,_14u);}),_14w=unCStr("h3"),_14x=function(_14y,_14z){var _14A=new T(function(){return A(_14y,[_14z]);});return function(_14B,_){var _14C=jsCreateElem(toJSStr(E(_14w))),_14D=jsAppendChild(_14C,E(_14B)[1]),_14E=[0,_14C],_14F=A(_14A,[_14E,_]);return _14E;};},_14G=unCStr("https://github.com/agocorona/hplayground"),_14H=unCStr("   "),_14I=unCStr("https://github.com/agocorona/hplayground/blob/master/src/Main.hs"),_14J=unCStr("haskell-web.blogspot.com.es/2014/07/hplayground-translate-your-console.html"),_14K=unCStr("Git repository"),_14L=new T(function(){return _Re(_4S,_14K);}),_14M=unCStr("Examples code"),_14N=new T(function(){return _Re(_4S,_14M);}),_14O=unCStr("Article"),_14P=new T(function(){return _Re(_4S,_14O);}),_14Q=function(_14R,_){var _14S=A(_14L,[_14R,_]),_14T=A(_B,[_H,_14S,_Rp,_14G,_]),_14U=_4S(_14H,_14R,_),_14V=A(_14N,[_14R,_]),_14W=A(_B,[_H,_14V,_Rp,_14I,_]),_14X=_4S(_14H,_14R,_),_14Y=A(_14P,[_14R,_]),_14Z=A(_B,[_H,_14Y,_Rp,_14J,_]);return _14R;},_150=new T(function(){return _v2(_uM,_14Q);}),_151=new T(function(){return _14x(_uM,_150);}),_152=function(_153,_){var _154=_13P(_153,_),_155=E(_154),_156=E(_155[1]),_157=A(_v0,[_155[2],_]),_158=E(_157),_159=E(_158[1]),_15a=A(_13g,[_158[2],_]),_15b=E(_15a),_15c=E(_15b[1]),_15d=A(_Ce,[_15b[2],_]),_15e=E(_15d),_15f=E(_15e[1]),_15g=_Ib(_15e[2],_),_15h=E(_15g),_15i=E(_15h[1]),_15j=_4f(_Uo,_Ts,_15h[2],_),_15k=E(_15j),_15l=E(_15k[1]),_15m=A(_12U,[_15k[2],_]),_15n=E(_15m),_15o=E(_15n[1]),_15p=A(_CV,[_15n[2],_]),_15q=E(_15p),_15r=E(_15q[1]),_15s=_Ry(_15q[2],_),_15t=E(_15s),_15u=E(_15t[1]),_15v=_10H(_15t[2],_),_15w=E(_15v),_15x=E(_15w[1]),_15y=_Zn(_15w[2],_),_15z=E(_15y),_15A=E(_15z[1]),_15B=_N3(_15z[2],_),_15C=E(_15B),_15D=E(_15C[1]),_15E=_SM(_15C[2],_),_15F=E(_15E),_15G=E(_15F[1]),_15H=_4f(_Wg,_Vs,_15F[2],_),_15I=E(_15H),_15J=E(_15I[1]),_15K=new T(function(){return _13Z(_uM,function(_15L,_){var _15M=A(new T(function(){var _15N=new T(function(){return _14b(_uM,function(_15O,_){var _15P=A(_12W,[_15O,_]),_15Q=A(_15c[1],[_15O,_]);return _15O;});}),_15R=new T(function(){return _14b(_uM,_159[1]);}),_15S=new T(function(){return _14b(_uM,_156[1]);});return _14l(_uM,function(_15T,_){var _15U=A(_15S,[_15T,_]),_15V=A(_B,[_H,_15U,_CA,_4O,_]),_15W=A(_15R,[_15T,_]),_15X=A(_B,[_H,_15W,_CA,_4O,_]),_15Y=A(_15N,[_15T,_]),_15Z=A(_B,[_H,_15Y,_CA,_4O,_]);return _15T;});}),[_15L,_]),_160=A(_B,[_H,_15M,_CA,_4Q,_]),_161=A(new T(function(){var _162=new T(function(){return _14b(_uM,_15r[1]);}),_163=new T(function(){return _14b(_uM,function(_164,_){var _165=A(_10Q,[_164,_]),_166=A(_15o[1],[_164,_]);return _164;});}),_167=new T(function(){return _14b(_uM,function(_168,_){var _169=A(_15f[1],[_168,_]),_16a=A(_15i[1],[_168,_]),_16b=A(_15l[1],[_168,_]);return _168;});});return _14l(_uM,function(_16c,_){var _16d=A(_167,[_16c,_]),_16e=A(_B,[_H,_16d,_CA,_4O,_]),_16f=A(_163,[_16c,_]),_16g=A(_B,[_H,_16f,_CA,_4O,_]),_16h=A(_162,[_16c,_]),_16i=A(_B,[_H,_16h,_CA,_4O,_]);return _16c;});}),[_15L,_]),_16j=A(_B,[_H,_161,_CA,_4Q,_]),_16k=A(new T(function(){var _16l=new T(function(){return _14b(_uM,function(_16m,_){var _16n=A(_Wq,[_16m,_]),_16o=A(_15A[1],[_16m,_]);return _16m;});}),_16p=new T(function(){return _14b(_uM,_15x[1]);}),_16q=new T(function(){return _14b(_uM,new T(function(){return _v2(_uM,_15u[1]);}));});return _14l(_uM,function(_16r,_){var _16s=A(_16q,[_16r,_]),_16t=A(_B,[_H,_16s,_CA,_4O,_]),_16u=A(_16p,[_16r,_]),_16v=A(_B,[_H,_16u,_CA,_4O,_]),_16w=A(_16l,[_16r,_]),_16x=A(_B,[_H,_16w,_CA,_4O,_]);return _16r;});}),[_15L,_]),_16y=A(_B,[_H,_16k,_CA,_4Q,_]),_16z=A(new T(function(){var _16A=new T(function(){return _14b(_uM,_15J[1]);}),_16B=new T(function(){return _14b(_uM,_15G[1]);}),_16C=new T(function(){return _14b(_uM,_15D[1]);});return _14l(_uM,function(_16D,_){var _16E=A(_16C,[_16D,_]),_16F=A(_B,[_H,_16E,_CA,_4O,_]),_16G=A(_16B,[_16D,_]),_16H=A(_B,[_H,_16G,_CA,_4O,_]),_16I=A(_16A,[_16D,_]),_16J=A(_B,[_H,_16I,_CA,_4O,_]);return _16D;});}),[_15L,_]),_16K=A(_B,[_H,_16z,_CA,_4Q,_]);return _15L;});});return [0,[0,function(_16L,_){var _16M=A(_149,[_16L,_]),_16N=A(_B,[_H,_16M,_CA,_Cz,_]),_16O=A(_151,[_16L,_]),_16P=A(_15K,[_16L,_]),_16Q=A(_B,[_H,_16P,_CA,_4P,_]),_16R=A(_14v,[_16L,_]);return _16L;},new T(function(){var _16S=E(_156[2]);if(!_16S[0]){var _16T=E(_159[2]);if(!_16T[0]){var _16U=E(_15c[2]);if(!_16U[0]){var _16V=E(_15f[2]);if(!_16V[0]){var _16W=E(_15i[2]);if(!_16W[0]){var _16X=E(_15l[2]);if(!_16X[0]){var _16Y=E(_15o[2]);if(!_16Y[0]){var _16Z=E(_15r[2]);if(!_16Z[0]){var _170=E(_15u[2]);if(!_170[0]){var _171=E(_15x[2]);if(!_171[0]){var _172=E(_15A[2]);if(!_172[0]){var _173=E(_15D[2]);if(!_173[0]){var _174=E(_15G[2]);return _174[0]==0?E(_15J[2]):E(_174);}else{return E(_173);}}else{return E(_172);}}else{return E(_171);}}else{return E(_170);}}else{return E(_16Z);}}else{return E(_16Y);}}else{return E(_16X);}}else{return E(_16W);}}else{return E(_16V);}}else{return E(_16U);}}else{return E(_16T);}}else{return E(_16S);}})],_15I[2]];},_175=unCStr("idelem"),_176=function(_){var _177=E(_175),_178=jsFind(toJSStr(_177)),_179=E(_178);return _179[0]==0?_45(_177):_l(_152,_179[1],_);},_17a=function(_){return _176(_);};
var hasteMain = function() {A(_17a, [0]);};window.onload = hasteMain;