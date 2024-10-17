let apiKey = ''; // NEVER store api keys in source code. This is why we use the storage API and prompt the user to enter their API key in the side panel.

function showApiKeyForm() {
  document.getElementById('apiKeyForm').style.display = 'block';
  document.getElementById('status').textContent = 'Please enter your Runway API Key to continue.';
}

function hideApiKeyForm() {
  document.getElementById('apiKeyForm').style.display = 'none';
}

document.getElementById('saveApiKey').addEventListener('click', () => {
  const inputApiKey = document.getElementById('apiKey').value.trim();
  if (inputApiKey) {
    chrome.storage.local.set({ apiKey: inputApiKey }, () => {
      apiKey = inputApiKey;
      hideApiKeyForm();
      document.getElementById('status').textContent = 'API Key saved. You can now generate videos.';
    });
  }
});

// Check for stored API key
chrome.storage.local.get("apiKey", (result) => {
  if (result.apiKey) {
    apiKey = result.apiKey;
    hideApiKeyForm();
  } else {
    showApiKeyForm();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "generateVideo") {
    if (apiKey) {
      generateVideo(message.imageUrl);
    } else {
      showApiKeyForm();
    }
  }
});

async function generateVideo(imageUrl) {
  if (!apiKey) {
    showApiKeyForm();
    return;
  }

  const statusElement = document.getElementById('status');
  statusElement.textContent = 'Generating video...';

  try {
    const taskId = await startVideoGeneration(imageUrl);
    const videoUrl = await pollForCompletion(taskId);
    renderVideo(videoUrl);
    saveVideoData(imageUrl, videoUrl);
  } catch (error) {
    statusElement.textContent = `Error: ${error.message}`;
  }
}

async function startVideoGeneration(imageUrl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "startVideoGeneration", imageUrl, apiKey }, (response) => {
      if (response.success) {
        resolve(response.taskId);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

async function pollForCompletion(taskId) {
  const statusElement = document.getElementById('status');
  
  while (true) {
    try {
      const videoUrl = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "pollForCompletion", taskId, apiKey }, (response) => {
          if (response.success) {
            resolve(response.videoUrl);
          } else if (response.error === 'still_processing') {
            reject(new Error('still_processing'));
          } else {
            reject(new Error(response.error));
          }
        });
      });

      return videoUrl;
    } catch (error) {
      if (error.message === 'still_processing') {
        statusElement.textContent = 'Generating video... Please wait.';
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
}

function renderVideo(videoUrl) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = 'Video generated successfully!';

  const videoContainer = document.getElementById('videoContainer');
  const videoWrapper = document.createElement('div');
  videoWrapper.className = 'video-wrapper';
  videoWrapper.innerHTML = `
    <button class="remove-video" data-url="${videoUrl}">x</button>
    <video controls autoplay muted loop src="${videoUrl}"></video>
  `;
  videoContainer.insertBefore(videoWrapper, videoContainer.firstChild);

  // Add event listener to the new remove button
  videoWrapper.querySelector('.remove-video').addEventListener('click', removeVideo);
}

function saveVideoData(imageUrl, videoUrl) {
  chrome.storage.local.get('generatedVideos', (result) => {
    const videos = result.generatedVideos || [];
    videos.push({ imageUrl, videoUrl, timestamp: Date.now() });
    chrome.storage.local.set({ generatedVideos: videos });
  });
}

function removeVideo(event) {
  const videoUrl = event.target.getAttribute('data-url');
  const videoWrapper = event.target.closest('.video-wrapper');

  chrome.storage.local.get('generatedVideos', (result) => {
    let videos = result.generatedVideos || [];
    videos = videos.filter(video => video.videoUrl !== videoUrl);
    chrome.storage.local.set({ generatedVideos: videos }, () => {
      videoWrapper.remove();
    });
  });
}

// Load previously generated videos
function loadSavedVideos() {
  chrome.storage.local.get('generatedVideos', (result) => {
    const videos = result.generatedVideos || [];
    const videoContainer = document.getElementById('videoContainer');
    videoContainer.innerHTML = ''; // Clear existing videos

    videos.reverse().forEach(video => {
      const videoWrapper = document.createElement('div');
      videoWrapper.className = 'video-wrapper';
      videoWrapper.innerHTML = `
        <button class="remove-video" data-url="${video.videoUrl}">x</button>
        <video controls autoplay muted loop src="${video.videoUrl}"></video>
      `;
      videoContainer.appendChild(videoWrapper);

      // Add event listener to the remove
      videoWrapper.querySelector('.remove-video').addEventListener('click', removeVideo);
    });
  });
}
loadSavedVideos()