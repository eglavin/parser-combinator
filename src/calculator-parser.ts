type Parser<T> = (input: string) => Result<T>;

type Result<T> =
  | { success: true; value: T; rest: string }
  | { success: false; error: string };

// Basic combinators:
function char(c: string): Parser<string> {
  return (input: string) => {
    if (input.length === 0) {
      return {
        success: false,
        error: "Unexpected end of input",
      };
    }

    if (input[0] === c) {
      return {
        success: true,
        value: c,
        rest: input.slice(1),
      };
    }

    return {
      success: false,
      error: `Expected '${c}', but got '${input[0]}'`,
    };
  };
}

function regex(re: RegExp): Parser<string> {
  return (input: string) => {
    const match = input.match(re);
    if (match && match.index === 0) {
      return {
        success: true,
        value: match[0],
        rest: input.slice(match[0].length),
      };
    }
    return {
      success: false,
      error: `Regex ${re} did not match`,
    };
  };
}

function sequence<T extends any[]>(...parsers: { [K in keyof T]: Parser<T[K]> }): Parser<T> {
  return (input: string) => {
    const results = [] as unknown as T;
    let currentInput = input;

    for (const parser of parsers) {
      const result = parser(currentInput);
      if (!result.success) {
        return result;
      }
      (results as unknown[]).push(result.value);
      currentInput = result.rest;
    }

    return {
      success: true,
      value: results,
      rest: currentInput,
    };
  };
}

function choice<T>(...parsers: Parser<T>[]): Parser<T> {
  return (input: string) => {
    for (const parser of parsers) {
      const result = parser(input);
      if (result.success) {
        return result;
      }
    }
    return {
      success: false,
      error: "No parsers matched",
    };
  };
}

function many<T>(parser: Parser<T>): Parser<T[]> {
  return (input: string) => {
    const results: T[] = [];
    let currentInput = input;

    while (true) {
      const result = parser(currentInput);
      if (!result.success) {
        break;
      }
      results.push(result.value);
      currentInput = result.rest;
    }

    return {
      success: true,
      value: results,
      rest: currentInput,
    };
  };
}

function map<T, U>(parser: Parser<T>, fn: (value: T) => U): Parser<U> {
  return (input: string) => {
    const result = parser(input);
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      value: fn(result.value),
      rest: result.rest,
    };
  };
}

// Calculator-specific parsers:
const number: Parser<number> = map(regex(/^\d+(\.\d+)?/), (value) =>
  parseFloat(value)
);

const operator: Parser<string> = regex(/^[+\-*/]/);

function between<T>(
  left: Parser<any>,
  parser: Parser<T>,
  right: Parser<any>
): Parser<T> {
  return (input: string) => {
    const leftResult = left(input);
    if (!leftResult.success) {
      return {
        success: false,
        error: `Expected '(' but got '${input}'`,
      };
    }

    const parserResult = parser(leftResult.rest);
    if (!parserResult.success) {
      return parserResult;
    }

    const rightResult = right(parserResult.rest);
    if (!rightResult.success) {
      return {
        success: false,
        error: `Expected ')' but got '${parserResult.rest}'`,
      };
    }

    return {
      success: true,
      value: parserResult.value,
      rest: rightResult.rest,
    };
  };
}

// Recursive expression parser:
function expression(): Parser<number> {
  return map(
    sequence(term(), many(sequence(regex(/^\s*[+\-]\s*/), term()))),
    ([initial, rest]) =>
      rest.reduce((acc, [op, value]) => {
        if (op.trim() === "+") return acc + value;
        if (op.trim() === "-") return acc - value;
        return acc;
      }, initial)
  );
}

function term(): Parser<number> {
  return map(
    sequence(factor(), many(sequence(regex(/^\s*[*/]\s*/), factor()))),
    ([initial, rest]) =>
      rest.reduce((acc, [op, value]) => {
        if (op.trim() === "*") return acc * value;
        if (op.trim() === "/") return acc / value;
        return acc;
      }, initial)
  );
}

function factor(): Parser<number> {
  return choice(
    number, // Handle numbers directly
    between(char("("), lazy(() => expression()), char(")")) // Handle parentheses lazily
  );
}

function lazy<T>(parserThunk: () => Parser<T>): Parser<T> {
  return (input: string) => parserThunk()(input);
}

function base(): Parser<number> {
  return choice(between(char("("), expression(), char(")")), number);
}

// Example usage:
const calcParser = expression();

const result = calcParser("2 + 3 * (4 - 1)");
if (result.success) {
  console.log("Result:", result.value); // Result: 11
} else {
  console.error("Error:", result.error);
}
