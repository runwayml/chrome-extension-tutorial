let apiKey = ''; // NEVER store api keys in source code. This is why we use the storage API and prompt the user to enter their API key in the side panel.
let selectedImageUrl = null;

const allowedRatios = [
  { width: 1280, height: 720 },
  { width: 720, height: 1280 },
  { width: 1104, height: 832 },
  { width: 832, height: 1104 },
  { width: 960, height: 960 },
  { width: 1584, height: 672 },
];

function findClosestRatio(width, height) {
  const inputRatio = width / height;
  let closest = allowedRatios[0];
  let minDiff = Math.abs(inputRatio - (closest.width / closest.height));
  for (const ratio of allowedRatios) {
    const ratioValue = ratio.width / ratio.height;
    const diff = Math.abs(inputRatio - ratioValue);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ratio;
    }
  }
  return `${closest.width}:${closest.height}`;
}

function getImageDimensions(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

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
      selectedImageUrl = message.imageUrl;
      document.getElementById('promptForm').style.display = 'block';
      document.getElementById('promptInput').value = '';
      document.getElementById('status').textContent = 'Enter a prompt and click Generate.';
      // Show the selected image
      const imgPreview = document.getElementById('selectedImagePreview');
      imgPreview.src = selectedImageUrl;
      imgPreview.style.display = 'block';
    } else {
      showApiKeyForm();
    }
  }
});

// Add event listener for Generate button
const generateButton = document.getElementById('generateButton');
generateButton.addEventListener('click', async () => {
  const prompt = document.getElementById('promptInput').value.trim();
  if (!selectedImageUrl || !prompt) {
    document.getElementById('status').textContent = 'Please select an image and enter a prompt.';
    return;
  }
  document.getElementById('promptForm').style.display = 'none';
  // Hide the image preview after starting generation
  document.getElementById('selectedImagePreview').style.display = 'none';
  await generateVideo(selectedImageUrl, prompt);
  selectedImageUrl = null;
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

async function generateVideo(imageUrl, prompt) {
  if (!apiKey) {
    showApiKeyForm();
    return;
  }

  const statusElement = document.getElementById('status');
  statusElement.textContent = '';
  const newImage = createImageAndLoader(imageUrl);
  document.getElementById('videoContainer').insertBefore(newImage, document.getElementById('videoContainer').firstChild);

  try {
    // Get image dimensions and closest ratio
    const { width, height } = await getImageDimensions(imageUrl);
    const closestRatio = findClosestRatio(width, height);

    // Pass closestRatio and prompt to startVideoGeneration
    const taskId = await startVideoGeneration(imageUrl, closestRatio, prompt);
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

async function startVideoGeneration(imageUrl, ratio, prompt) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "startVideoGeneration", imageUrl, apiKey, ratio, prompt }, (response) => {
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
  removeButton.innerHTML = `<svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M17.97 17.26L10.19 9.49L17.97 1.71L17.26 1L9.49 8.78L1.71 1L1 1.71L8.78 9.49L1 17.26L1.71 17.97L9.49 10.19L17.26 17.97L17.97 17.26Z" fill="#0C0C0C"/>
</svg>
`;
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