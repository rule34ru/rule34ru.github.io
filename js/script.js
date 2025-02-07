let currentPage = 0;
const postsPerPage = 42;

function getMediaType(post) {
  const url = post.file_url.toLowerCase();
  const extension = url.split('.').pop().split(/[#?]/)[0];
  return extension === 'gif' ? 'gif' : 
         ['mp4','webm','mov','avi','wmv','mkv','flv','gifv'].includes(extension) ? 'video' : 'image';
}

async function searchPosts() {
  const tags = document.getElementById('tagsInput').value;
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tags)}&pid=${currentPage}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Ошибка сети');
    const posts = await response.json();
    displayPosts(posts);
    updatePaginator();
  } catch (error) {
    console.error('Ошибка при получении постов:', error);
  }
}

function displayPosts(posts) {
  const container = document.getElementById('postsContainer');
  container.innerHTML = '';
  posts.forEach(post => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    
    const mediaType = getMediaType(post);
    thumb.dataset.mediaType = mediaType;

    const aspectRatio = post.width / post.height;
    thumb.dataset.aspectRatio = aspectRatio < 0.75 ? 'tall' : 
                              aspectRatio > 1.5 ? 'wide' : 'normal';

    const img = document.createElement('img');
    img.src = post.preview_url;
    img.alt = 'Preview';
    img.loading = 'lazy';
    img.style.aspectRatio = `${post.width}/${post.height}`;
    img.onclick = () => openMediaView(post);
    
    thumb.appendChild(img);
    container.appendChild(thumb);
  });
}

async function openMediaView(post) {
  document.body.style.overflow = 'hidden';
  const mediaView = document.getElementById('mediaView');
  const mediaContent = document.getElementById('mediaContent');
  
  const mediaType = getMediaType(post);
  const aspectRatio = post.width / post.height;

  const mediaElement = mediaType === 'gif' 
    ? `<img src="${post.file_url}" alt="Full size" class="gif-media">`
    : mediaType === 'video'
    ? `<video controls><source src="${post.file_url}" type="video/mp4"></video>`
    : `<img src="${post.file_url}" alt="Full size">`;

  const comments = await fetchComments(post.id);
  const tags = post.tags.split(' ');

  mediaContent.innerHTML = `
    ${mediaElement}
    <div class="media-info">
      <div class="tag-list collapsed">
        ${tags.map(tag => `<button class="tag" onclick="addTagToSearch('${tag}')">${tag}</button>`).join('')}
        ${tags.length > 10 ? 
          `<button class="show-more-tags" onclick="expandTags(this)">
            Показать ещё (${tags.length - 10})
          </button>` : ''}
      </div>
      <div class="comments-section">
        <h4>Комментарии:</h4>
        ${comments.length ? 
          comments.map(c => `
            <div class="comment">
              <strong>${c.owner}:</strong> ${c.body}
            </div>
          `).join('') : '<p>Нет комментариев</p>'}
      </div>
    </div>
  `;

  mediaView.classList.add('active');
}

function closeMediaView() {
  const mediaContent = document.getElementById('mediaContent');
  const videos = mediaContent.getElementsByTagName('video');
  Array.from(videos).forEach(video => {
    video.pause();
    video.currentTime = 0;
  });
  document.body.style.overflow = '';
  document.getElementById('mediaView').classList.remove('active');
}

async function fetchComments(postId) {
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=comment&q=index&post_id=${postId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Ошибка сети при загрузке комментариев');
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "application/xml");
    const commentElements = xmlDoc.getElementsByTagName('comment');
    return Array.from(commentElements).map(el => ({
      owner: el.getAttribute('creator') || 'Анон',
      body: el.getAttribute('body') || ''
    }));
  } catch (error) {
    console.error('Ошибка при загрузке комментариев:', error);
    return [];
  }
}

function addTagToSearch(tag) {
  const input = document.getElementById('tagsInput');
  input.value = tag;
  currentPage = 0;
  closeMediaView();
  searchPosts();
}

function changePage(direction) {
  currentPage = Math.max(0, currentPage + direction);
  searchPosts();
}

function updatePaginator() {
  const pageElement = document.getElementById('currentPage');
  pageElement.textContent = currentPage + 1;
}

function handlePageInput(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    updatePageFromInput();
  }
}

function updatePageFromInput() {
  const pageElement = document.getElementById('currentPage');
  const newPage = parseInt(pageElement.textContent) - 1;
  
  if (!isNaN(newPage) && newPage >= 0) {
    currentPage = newPage;
    searchPosts();
  } else {
    pageElement.textContent = currentPage + 1;
  }
}

function expandTags(button) {
  const tagList = button.parentElement;
  tagList.classList.remove('collapsed');
  button.remove();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isHidden = sidebar.style.display === 'none';
  sidebar.style.display = isHidden ? 'block' : 'none';
  localStorage.setItem('sidebarHidden', !isHidden);
}

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('sidebarHidden') === 'true') {
    document.getElementById('sidebar').style.display = 'none';
  }
  searchPosts();
});