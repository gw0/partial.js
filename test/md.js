var utils = require('../utils');

const EMPTY = 0;
const PARAGRAPH = 100;
const EMBEDDED = 101;
const LIST = 102;
const KEYVALUE = 103;
const TMP = '@##';

const REG_LINK_1 = /\<.*?\>+/g;
const REG_LINK_2 = /(!)?\[[^\]]+\][\:\s\(]+.*?[^)\s$]+/g;
const REG_LINK_3 = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
const REG_LINK_4 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
const REG_IMAGE = /(\[)?\!\[[^\]]+\][\:\s\(]+.*?[^\s$]+/g;
const REG_FORMAT = /\*{1,2}.*?\*{1,2}|_{1,3}.*?_{1,3}/g;
const REG_KEYWORD = /(\[.*?\]|\{.*?\})/g;

function Markdown() {

	this.embedded = '===';

	this.onEmbedded = function(type, lines) {
		return lines.join('\n');
	};

	this.onKeyword = function(type, value) {
		return '<span>' + value + '</span>';
	};

	this.onParagraph = function(type, lines) {

		var self = this;
		var cls = '';

		switch (type)
		{
			case '>':
			case '|':
				cls = 'quote';
				break;

			case '//':
				cls = 'comment';
				break;
		}

		return '<p class="' + cls +'">' + lines.join('<br />') + '</p>';
	};

	this.onLine = function(line) {
		return '<p class="line">' + line + '</p>';
	};

	this.onFormat = function(type, value) {

		switch (type) {
			case '**':
				return '<em>' + value + '</em>';
			case '*':
				return '<i>' + value + '</i>';
			case '__':
				return '<strong>' + value + '</strong>';
			case '_':
				return '<b>' + value + '</b>';
		}

		return value;
	};

	this.onLink = function(text, url) {

		if (url.substring(0, 7) !== 'http://' && url.substring(0, 8) !== 'https://')
			url = 'http://' + url;

		return '<a href="' + url + '>' + text + '</a>';
	};

	this.onImage = function(alt, src, width, height, url) {
		var tag = '<img src="' + src + '"' + (width ? ' width="' + width + '"' : '') + (height ? ' height="' + height + '"' : '') + ' alt="' + alt +'" border="0" />';

		if (url)
			return '<a href="' + url + '">' + tag + '</a>';

		return img;
	};

	this.onList = function(items) {

		var length = items.length;
		var output = '';

		for (var i = 0; i < length; i++) {
			var item = items[i];
			output += '<li>' + item.value + '</li>';
		}

		return '<ul>' + output + '</ul>';

	};

	this.onKeyValue = function(items) {

		var length = items.length;
		var output = '';

		for (var i = 0; i < length; i++) {
			var item = items[i];
			output += '<dt>' + item.key + '</dt><dd>' + item.value + '</dd>';
		}

		return '<dl>' + output + '</dl>';
	};

	this.onBreak = function(type) {

		switch (type) {
			case '\n':
				return '<br />';
			case '***':
			case '---':
				return '<hr />';
		}

		return '<br />';
	};

	this.onTitle = function(type, text) {

		switch (type) {
			case '#':
				return '<h1>' + text + '</h1>'
			case '##':
				return '<h2>' + text + '</h2>'
			case '###':
				return '<h3>' + text + '</h3>'
			case '####':
				return '<h4>' + text + '</h4>'
			case '#####':
				return '<h5>' + text + '</h5>'
		}

		return type + ' ' + text;
	};

	this.current = [];
	this.status = 0;
	this.command = '';
	this.skip = false;
	this.output = '';
	this.tmp = [];
	this.id = '';
}

Markdown.prototype.load = function(text, id) {

	var self = this;
	var arr = text.split('\n');
	var length = arr.length;

	self.output = '';

	for (var i = 0; i < length; i++) {

		if (self.skip) {
			self.skip = false;
			continue;
		}

		var line = arr[i];

		if (self.parseEmbedded(line))
			continue;

		if (self.parseBreak(line))
			continue;

		if (self.parseList(line))
			continue;

		if (self.parseKeyValue(line))
			continue;

		if (self.parseParagraph(line))
			continue;

		if (self.parseTitle(line, arr[i + 1]))
			continue;

		if (self.onLine !== null)
			self.output += self.onLine(self.parseOther(line));
	}

	if (self.status !== EMPTY)
		self.flush();

	return self.output;
};

Markdown.prototype.parseEmbedded = function(line) {

	var self = this;
	var status = self.status;
	var chars = self.embedded + (status !== EMBEDDED ? ' ' : '');
	var has = line.substring(0, chars.length) === chars;

	if (status !== EMBEDDED && !has)
		return false;

	if (status !== EMBEDDED && has)
		self.flush();

	if (status === EMBEDDED && has) {
		self.flush();
		self.status = EMPTY;
		return true;
	}

	if (has) {
		self.status = EMBEDDED;
		status = EMBEDDED;
		self.command = line.substring(chars.length);
		return true;
	}

	if (status === EMBEDDED)
		self.current.push(line);

	return true;
};

Markdown.prototype.parseBreak = function(line) {

	var self = this;

	if (line === '' || line === '***' || line === '---') {

		var status = self.status;

		if (status !== EMPTY)
			self.flush();

		self.status = EMPTY;

		if (self.onBreak)
			self.output += self.onBreak(line === '' ? '\n' : line) || '';

		return true;
	}

	return false;
};

Markdown.prototype.parseList = function(line) {

	var self = this;

	var first = line[0] || '';
	var second = line[1] || '';

	var has = (first === '-' || first === '+' || first === 'x') && (second === ' ');

	if (!has)
		return false;

	var status = self.status;

	if (status !== LIST) {
		self.flush();
		self.status = LIST;
	}

	self.current.push({ type: first, value: self.parseOther(line.substring(3)) });
	return true;
};

Markdown.prototype.parseKeyValue = function(line) {

	var self = this;
	var index = line.indexOf(':');

	if (index === -1)
		return false;

	var tmp = line.substring(0, index);
	var length = tmp.length;

	var countTab = 0;
	var countSpace = 0;

	for (var i = 0; i < length; i++) {

		var c = tmp[i];

		if (c === '\t') {
			countTab++;
			break;
		}

		if (c === ' ') {
			countSpace++;
			if (countSpace > 2)
				break;
		} else
			countSpace = 0;
	}

	if (countSpace < 3 && countTab <= 0)
		return false;

	var status = self.status;

	if (status !== KEYVALUE) {
		self.flush();
		self.status = KEYVALUE;
	}

	self.current.push({ key: self.parseOther(tmp.trim()), value: self.parseOther(line.substring(index + 1).trim()) });
	return true;
};

Markdown.prototype.parseParagraph = function(line) {

	var self = this;
	var first = line[0] || '';
	var second = line[1] || '';
	var index = 0;
	var has = false;

	switch (first) {
		case '>':
		case '|':
			has = second === ' ';
			index = 1;
			break;

		case '/':
			has == second === '/' && line[3] === ' ';
			index = 2;
			break;
	}

	if (!has)
		return false;

	var status = self.status;

	if (has) {
		var command = first + (first === '/' ? '/' : '');
		if (self.command !== '' && self.command !== command && status === PARAGRAPH)
			self.flush();
		self.command = command;
	}

	if (status !== PARAGRAPH) {
		self.flush();
		self.status = PARAGRAPH;
		status = PARAGRAPH;
	}

	self.current.push(self.parseOther(line.substring(index).trim()));

	return true;
};

Markdown.prototype.parseTitle = function(line, next) {

	var self = this;
	var has = line[0] === '#';
	var type = '';

	if (!has) {
		var first = (next || '')[0] || '';
	 	has = line[0].charCodeAt(0) > 64 && (first === '=' || first === '-');

	 	if (has)
	 		has = line.length === next.length;

	 	if (has) {
	 		type = first === '=' ? '#' : '##';
	 		self.skip = true;
	 	}

	} else {

		var index = line.indexOf(' ');
		if (index === -1)
			return false;

		type = line.substring(0, index).trim();
	}

	if (!has)
		return false;

	if (self.status !== EMPTY)
		self.flush();

	if (self.onTitle !== null)
		self.output += self.onTitle(type, self.parseOther(self.skip ? line : line.substring(type.length + 1))) || '';

	return true;
};

Markdown.prototype.parseOther = function(line) {

	var self = this;

	if (self.tmp.length > 0)
		self.tmp = [];

	// link
	line = self.parseLink(line);

	// image
	line = self.parseImage(line);

	// other
	line = self.parseFormat(line);

	// inline linke
	line = self.parseLinkInline(line);

	if (self.tmp.length > 0) {
		var length = self.tmp.length;
		for (var i = 0; i < length; i++) {
			var item = self.tmp[i];
			line = line.replace(item.k, item.v);
		}
	}

	return line;
};

Markdown.prototype.parseFormat = function(text, flush) {

	var matches = text.match(REG_FORMAT);
	if (matches === null)
		return text;

	var self = this;
	var length = matches.length;

	for (var i = 0; i < length; i++) {

		var o = matches[i];
		var isAsterix = o[0] === '*';
		var value = '';

		if (isAsterix) {
			value = self.onFormat(o[1] === '*' ? '**' : '*', o.replace(/^\*{1,2}|\*{1,2}$/g, ''));
			text = text.replace(o, flush ? value : self.getReplace(o, value));
		} else {
			value = self.onFormat(o[1] === '_' ? '__' : '_', o.replace(/^_{1,2}|_{1,2}$/g, ''));
			text = text.replace(o, flush ? value : self.getReplace(o, value));
		}
	}

	return text;
};

Markdown.prototype.parseLink = function(text) {

    var matches = text.match(REG_LINK_1);
    var output = text;
    var length = 0;
    var self = this;

    if (matches !== null) {
    	length = matches.length;
        for (var i = 0; i < length; i++) {
        	var o = matches[i];
            var url = o.substring(1, o.length - 1);
            output = output.replace(o, self.getReplace(o, self.onLink(url, url)));
        }
    }

    matches = text.match(REG_LINK_2);

    if (matches === null)
        return output;

    length = matches.length;

    for (var i = 0; i < length; i++) {

    	var o = matches[i];

        if (o.substring(0, 3) === '[![')
            continue;

        var index = o.indexOf(']');
        if (index === -1)
            continue;

        if (o[0] === '!')
            continue;

        var text = o.substring(1, index).trim();
        var url = o.substring(index + 1).trim();

        var first = url[0];

        if (first === '(' || first === '(' || first === ':')
            url = url.substring(1).trim();
        else
            continue;

        if (first === '(')
            o += ')';

        var last = url[url.length - 1];

        if (last === ',' || last === '.' || last === ' ')
            url = url.substring(0, url.length - 1);
        else
            last = '';

       	output = output.replace(o, self.getReplace(o, self.onLink(self.parseFormat(text, true), url) + last));
    }

    return output;
};

Markdown.prototype.parseLinkInline = function(text) {

	var matches = text.match(REG_LINK_3);
	var length = 0;
	var self = this;

	if (matches !== null) {

		length = matches.length;
		for (var i = 0; i < length; i++) {
			var o = matches[i].trim();
			text = text.replace(o, self.getReplace(o, self.onLink(o, o)));
		}

	}

	matches = text.match(REG_LINK_4);

	if (matches !== null) {

		length = matches.length;
		for (var i = 0; i < length; i++) {
			var o = matches[i].trim();
			text = text.replace(o, self.getReplace(o, self.onLink(o, o)));
		}

	}

	return text;
};

Markdown.prototype.parseImage = function(text) {

    var output = text;
    var matches = text.match(REG_IMAGE);

    if (matches === null)
        return output;

    var self = this;

    var length = matches.length;

    for (var i = 0; i < length; i++) {

    	var o = matches[i];
        var indexBeg = 2;

        if (o.substring(0, 3) === '[![')
            indexBeg = 3;

        var index = o.indexOf(']');
        if (index === -1)
            continue;

        var text = o.substring(indexBeg, index).trim();
        var url = o.substring(index + 1).trim();

        var first = url[0];
        if (first !== '(')
            continue;

        index = o.lastIndexOf(')');
        if (index === -1)
            continue;

        var find = o.substring(0, index + 1);

        url = url.substring(1, index + 1);
        index = url.indexOf('#');
        indexBeg = index;

        var src = '';
        var indexEnd = url.indexOf(')', index);

        var dimension = [];

        if (index > 0) {
            dimension = url.substring(indexBeg + 1, indexEnd).split('x');
            src = url.substring(0, index);
        } else
        	src = url.substring(0, indexEnd);

        indexBeg = url.indexOf('(', indexEnd);
        indexEnd = url.lastIndexOf(')');

        if (indexBeg !== -1 && indexBeg > index)
            url = url.substring(indexBeg + 1, indexEnd);
        else
            url = '';

        output = output.replace(find, self.getReplace(find, self.onImage(text, src, parseInt(dimension[0] || '0', 10), parseInt(dimension[1] || '0', 10), url)));
    }

    return output;
}

Markdown.prototype.parseKeyword = function(text) {
    var matches = text.match(REG_KEYWORD);
    var length = 0;
    var self = this;

    if (matches === null)
    	return text;

	length = matches.length;
    for (var i = 0; i < length; i++) {
    	var o = matches[i];
    	var type = '[]';

    	if (o[0] === '{')
    		type = '{}';

    	var value = o;

    	if (type === '{}')
    		value = value.replace(/^\{{}|(\}|]){1}$/g, '');
    	else
    		value = value.replace(/^\[{}|(\]|]){1}$/g, '');    		

        text = text.replace(o, self.getReplace(o, value));
    }

    return text;
};

Markdown.prototype.getReplace = function(find, value) {
	var self = this;
	var key = TMP + self.tmp.length + ';'
    self.tmp.push({ k: key, v: value });
	return key;
};

Markdown.prototype.flush = function() {

	var self = this;

	switch (self.status) {
		case EMBEDDED:

			if (self.onEmbedded !== null)
				self.output += self.onEmbedded(self.command, self.current);

			break;

		case LIST:

			if (self.onList !== null)
				self.output += self.onList(self.current);

			break;

		case KEYVALUE:

			if (self.onKeyValue !== null)
				self.output += self.onKeyValue(self.current);

			break;

		case PARAGRAPH:

			if (self.onParagraph !== null)
				self.output += self.onParagraph(self.command, self.current);

			break;
	}

	self.current = [];
	self.command = '';
};

// ======================================================
// EXPORTS
// ======================================================

exports.init = function() {
    return new Markdown();
};

exports.load = function() {
    return new Markdown();
};

exports.markdown = function() {
    return new Markdown();
};

exports.md = function() {
    return new Markdown();
};
