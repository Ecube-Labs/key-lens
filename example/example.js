// Example file to test Key-Lens extension
const messages = {
  greeting: "hello",
  farewell: "world",
  welcomeMsg: "welcome",
  buttonText: "button.save",
  cancelText: "button.cancel",
  successText: "message.success",
  errorText: "error.notFound",
};

function showMessage() {
  console.log("hello");
  console.log("world");
  console.log("welcome");
}

const config = {
  save: "button.save",
  cancel: "button.cancel",
};

// Test with different quote types
const singleQuote = "hello";
const doubleQuote = "world";
const backtick = `welcome`;

// Test with nested keys
const nestedMessage = "message.success";
const errorMessage = "error.notFound";
