chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generateVideo",
    title: "Generate video with Runway",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "generateVideo") {
    chrome.sidePanel.open({ windowId: tab.windowId });
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "generateVideo", imageUrl: info.srcUrl });
    }, 1000);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startVideoGeneration") {
    startVideoGeneration(message.imageUrl, message.apiKey, message.ratio, message.prompt)
      .then(taskId => sendResponse({ success: true, taskId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.action === "pollForCompletion") {
    pollForCompletion(message.taskId, message.apiKey)
      .then(videoUrl => sendResponse({ success: true, videoUrl }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function startVideoGeneration(imageUrl, apiKey, ratio, prompt) {
  const response = await fetch(
    "https://api.dev.runwayml.com/v1/image_to_video",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        promptImage: imageUrl,
        seed: Math.floor(Math.random() * 1000000000),
        model: "gen4_turbo",
        promptText: prompt,
        duration: 5,
        ratio,
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to start video generation');
  }
  return result.id;
}

async function pollForCompletion(taskId, apiKey) {
  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "X-Runway-Version": "2024-11-06",
    },
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to check task status');
  }

  if (result.status === 'SUCCEEDED') {
    return result.output[0];
  } else if (result.status === 'FAILED') {
    throw new Error('Video generation failed');
  } else {
    throw new Error('still_processing');
  }
}
