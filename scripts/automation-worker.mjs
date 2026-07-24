const target = process.env.APEX_AUTOMATION_TARGET;
const token = process.env.APEX_AUTOMATION_WORKER_TOKEN;
const workerId = process.env.APEX_AUTOMATION_WORKER_ID || "aca-scheduled-worker";

if (!target || !token) {
  console.error("Automation worker target or token is missing.");
  process.exit(2);
}

const response = await fetch(target, {
  method: "POST",
  headers: {
    "x-apex-automation-token": token,
    "x-apex-worker-id": workerId,
  },
});
const body = await response.text();
if (!response.ok) {
  console.error(`Automation worker failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  process.exit(1);
}
console.log(body.slice(0, 2_000));
