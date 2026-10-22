#!/usr/bin/env node
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";

const result = {
  type: "result",
  is_error: false,
  structured_output: {
    summary: "done",
    data: {
      dodChecklist: [],
    },
  },
};

switch (mode) {
  case "ok":
    console.log(JSON.stringify(result));
    break;
  case "fail":
    process.exit(1);
    break;
  case "null-output":
    console.log(
      JSON.stringify({
        ...result,
        structured_output: null,
      }),
    );
    break;
  case "bad-json":
    console.log("this is not json");
    break;
  case "hang":
    setInterval(() => {}, 1000);
    break;
  default:
    console.error(`unknown FAKE_CLAUDE_MODE ${mode}`);
    process.exit(2);
}
