package io.github.dlepaux.realtimebpmanalyzer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A strict JSON reader for vectors.json, so the tests need no JSON library. Objects are insertion-ordered maps,
 * arrays are lists, every number is a {@code Double} parsed by {@link Double#parseDouble} (correctly rounded, as
 * JS's JSON.parse), and {@code null} is a null value under its key. Anything that is not JSON is refused.
 */
final class Json {
    private final String text;
    private int at;

    private Json(String text) {
        this.text = text;
    }

    static Object parse(String text) {
        Json json = new Json(text);
        Object value = json.value();
        json.skipSpace();
        if (json.at != text.length()) {
            throw json.error("trailing characters");
        }
        return value;
    }

    private Object value() {
        skipSpace();
        if (at >= text.length()) {
            throw error("unexpected end");
        }
        char c = text.charAt(at);
        switch (c) {
            case '{':
                return object();
            case '[':
                return array();
            case '"':
                return string();
            case 't':
                return literal("true", Boolean.TRUE);
            case 'f':
                return literal("false", Boolean.FALSE);
            case 'n':
                return literal("null", null);
            default:
                return number();
        }
    }

    private Map<String, Object> object() {
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        at++;
        skipSpace();
        if (peek() == '}') {
            at++;
            return map;
        }
        while (true) {
            skipSpace();
            String key = string();
            if (map.containsKey(key)) {
                throw error("duplicate key " + key);
            }
            skipSpace();
            expect(':');
            map.put(key, value());
            skipSpace();
            if (peek() == ',') {
                at++;
                continue;
            }
            expect('}');
            return map;
        }
    }

    private List<Object> array() {
        List<Object> list = new ArrayList<Object>();
        at++;
        skipSpace();
        if (peek() == ']') {
            at++;
            return list;
        }
        while (true) {
            list.add(value());
            skipSpace();
            if (peek() == ',') {
                at++;
                continue;
            }
            expect(']');
            return list;
        }
    }

    private String string() {
        expect('"');
        StringBuilder out = new StringBuilder();
        while (true) {
            if (at >= text.length()) {
                throw error("unterminated string");
            }
            char c = text.charAt(at++);
            if (c == '"') {
                return out.toString();
            }
            if (c < 0x20) {
                throw error("control character in a string");
            }
            if (c != '\\') {
                out.append(c);
                continue;
            }
            char escape = text.charAt(at++);
            switch (escape) {
                case '"': out.append('"'); break;
                case '\\': out.append('\\'); break;
                case '/': out.append('/'); break;
                case 'b': out.append('\b'); break;
                case 'f': out.append('\f'); break;
                case 'n': out.append('\n'); break;
                case 'r': out.append('\r'); break;
                case 't': out.append('\t'); break;
                case 'u':
                    out.append((char) Integer.parseInt(text.substring(at, at + 4), 16));
                    at += 4;
                    break;
                default:
                    throw error("bad escape \\" + escape);
            }
        }
    }

    private Double number() {
        int start = at;
        while (at < text.length() && "+-0123456789.eE".indexOf(text.charAt(at)) >= 0) {
            at++;
        }
        String token = text.substring(start, at);
        if (!token.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?")) {
            throw error("bad number " + token);
        }
        return Double.parseDouble(token);
    }

    private Object literal(String word, Object value) {
        if (!text.startsWith(word, at)) {
            throw error("bad literal");
        }
        at += word.length();
        return value;
    }

    private void skipSpace() {
        while (at < text.length() && " \t\r\n".indexOf(text.charAt(at)) >= 0) {
            at++;
        }
    }

    private char peek() {
        if (at >= text.length()) {
            throw error("unexpected end");
        }
        return text.charAt(at);
    }

    private void expect(char c) {
        if (peek() != c) {
            throw error("expected " + c);
        }
        at++;
    }

    private IllegalArgumentException error(String what) {
        return new IllegalArgumentException("vectors.json: " + what + " at character " + at);
    }
}
