// Sample JavaScript file for testing
class Calculator {
	constructor() {
		this.result = 0;
	}

	add(a, b) {
		this.result = a + b;
		return this.result;
	}

	subtract(a, b) {
		this.result = a - b;
		return this.result;
	}

	multiply(a, b) {
		this.result = a * b;
		return this.result;
	}

	divide(a, b) {
		if (b === 0) {
			throw new Error('Division by zero');
		}
		this.result = a / b;
		return this.result;
	}

	getResult() {
		return this.result;
	}
}

function fibonacci(n) {
	if (n <= 1) return n;
	return fibonacci(n - 1) + fibonacci(n - 2);
}

const PI = 3.14159265359;

module.exports = {
	Calculator,
	fibonacci,
	PI,
};
