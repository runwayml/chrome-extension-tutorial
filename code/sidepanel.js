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

function createImageAndLoader(imageUrl) {
  const container = document.createElement('div');
  container.className = 'image-container';

  const imageContainer = document.createElement('div');
  imageContainer.className = 'image-container';

  const loader = document.createElement('div');
  loader.className = 'loader';

  const loaderText = document.createElement('div');
  loaderText.textContent = 'Generating video...';

  const newImage = document.createElement('img');
  newImage.src = imageUrl;
  newImage.style.width = '100%';
  newImage.style.height = 'auto';

  imageContainer.appendChild(loader);
  imageContainer.appendChild(newImage);
  container.appendChild(imageContainer);
  container.appendChild(loaderText);
  return container;
}

async function generateVideo(imageUrl) {
  if (!apiKey) {
    showApiKeyForm();
    return;
  }

  const statusElement = document.getElementById('status');
  statusElement.textContent = '';
  const newImage = createImageAndLoader(imageUrl);
  document.getElementById('videoContainer').insertBefore(newImage, document.getElementById('videoContainer').firstChild);

  try {
    const taskId = await startVideoGeneration(imageUrl);
    newImage.id = `image-${taskId}`;

    const videoUrl = await pollForCompletion(taskId);
    document.getElementById(`image-${taskId}`).remove();
    renderVideo(videoUrl);
    saveVideoData(imageUrl, videoUrl);
  } catch (error) {
    newImage.remove();
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
        statusElement.textContent = '';
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
}

function renderVideo(videoUrl) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = '';

  const videoContainer = document.getElementById('videoContainer');
  const videoWrapper = document.createElement('div');
  videoWrapper.className = 'video-wrapper';
  videoWrapper.innerHTML = `
    <video controls autoplay muted loop src="${videoUrl}"></video>
  `;
  videoContainer.insertBefore(videoWrapper, videoContainer.firstChild);
  const removeButton = document.createElement('button');
  removeButton.className = 'remove-button';
  removeButton.setAttribute('data-url', videoUrl);
  removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  videoWrapper.appendChild(removeButton);

  // Add event listener to the new remove button
  videoWrapper.querySelector('.remove-button').addEventListener('click', removeVideo);
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
      renderVideo(video.videoUrl);
    });
  });
}
loadSavedVideos()