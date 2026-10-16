import stylistic from "@stylistic/eslint-plugin";

export default [
  {
    files: ["**/*.js"],
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      // An `if` always has a block, so its body is on its own line.
      curly: ["error", "all"],
      // An object literal with a property always breaks the line after `{`.
      // Prettier keeps it, because it keeps the line break after `{`.
      "@stylistic/object-curly-newline": [
        "error",
        {
          ObjectExpression: {
            minProperties: 1,
          },
        },
      ],
    },
  },
];
