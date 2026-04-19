export function buildFeishuText({ title, runId, status, details = [] }) {
  const lines = [
    `【${title}】`,
    `run_id: ${runId}`,
    `status: ${status}`,
    `time: ${new Date().toISOString()}`,
  ];

  for (const detail of details) {
    lines.push(`- ${detail}`);
  }

  return lines.join('\n');
}

export async function sendFeishuText({ webhookUrl, text }) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Feishu notify failed: HTTP ${response.status} ${body}`);
  }

  return response.json();
}
