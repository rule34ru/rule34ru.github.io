// js/main.js

// --- State Variables ---
let currentPage = 0;
const postsPerPage = 42; // Default limit for R34 API is often 42 or 100, adjust if needed
let sortedTagData = []; // Stores { label: "tag name", value: "tag_name", count: 123 } sorted by count
let currentPosts = []; // Holds the posts currently displayed or viewed from the last search
let isLoading = false; // Flag to prevent multiple simultaneous API requests
let awesompleteInstances = {}; // Object to store Awesomplete instances (e.g., awesompleteInstances.main, awesompleteInstances.tags)

// --- DOM Element References ---
// Use const for elements expected to exist on page load. Check for null later if needed.
const mainSearchInput = document.getElementById('mainSearchInput');
const tagsInput = document.getElementById('tagsInput');
const postsContainer = document.getElementById('postsContainer');
const mediaView = document.getElementById('mediaView');
const mediaContent = document.getElementById('mediaContent');
const currentPageSpan = document.getElementById('currentPage');
const sidebar = document.getElementById('sidebar');
const siteTitle = document.getElementById('site-title');
const heroSection = document.querySelector('.hero-section'); // Reference to hide/show
const mainInterface = document.querySelector('.main-interface'); // Reference to hide/show

// --- Initialization ---
// Wait for the DOM to be fully loaded before running scripts interacting with it.
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed.'); // Log for debugging
    if (!mainSearchInput || !tagsInput || !postsContainer || !mediaView || !mediaContent || !currentPageSpan || !sidebar || !siteTitle || !heroSection || !mainInterface) {
        console.error("Не все необходимые DOM элементы найдены! Проверьте HTML структуру и ID.");
        // Potentially display an error to the user here
        document.body.innerHTML = '<p style="color: red; text-align: center; padding: 50px;">Ошибка: Не удалось загрузить интерфейс. Пожалуйста, проверьте консоль разработчика.</p>';
        return; // Stop initialization if critical elements are missing
    }

    try {
        // Restore sidebar visibility state from localStorage
        if (localStorage.getItem('sidebarHidden') === 'true') {
            sidebar.style.display = 'none';
        }

        // Load tags, then initialize Awesomplete for both search inputs
        await loadAndPrepareTags();
        awesompleteInstances.main = initializeAwesomplete(mainSearchInput, sortedTagData);
        awesompleteInstances.tags = initializeAwesomplete(tagsInput, sortedTagData);

        // Handle initial page state based on URL parameters (tags, page, view)
        await handleInitialLoad();

        // Setup core event listeners for user interaction
        setupEventListeners();

        console.log('Инициализация завершена успешно.');

    } catch (error) {
        console.error('Глобальная ошибка инициализации:', error);
        // Display a user-friendly error message
        const errorDisplayArea = postsContainer || mainInterface || document.body;
        errorDisplayArea.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Ошибка загрузки приложения: ${error.message}. Попробуйте обновить страницу.</p>`;
    }
});

/**
 * Loads tag data from JSON files located in the 'tags8/' directory.
 * Parses, validates, filters, sorts tags by count, and stores them in `sortedTagData`.
 */
async function loadAndPrepareTags() {
    console.log('Загрузка тегов...');
    let currentFile = 1;
    const allTagsRaw = [];
    const MAX_TAG_FILES = 20; // Adjust this number if you have more or fewer tag files
    const tagsBaseUrl = 'tags8/'; // Base path for tag files relative to index.html

    while (currentFile <= MAX_TAG_FILES) {
        const filePath = `${tagsBaseUrl}tags_${currentFile}.json`;
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                // If a file is not found, and it's not the first file, assume we've reached the end
                if (response.status === 404 && currentFile > 1) {
                    console.log(`Файл ${filePath} не найден, завершение загрузки тегов.`);
                    break;
                }
                // For other errors or if the first file is missing, throw an error
                throw new Error(`HTTP error! status: ${response.status} при загрузке ${filePath}`);
            }
            const data = await response.json();

            // Validate that the fetched data is an array
            if (!Array.isArray(data)) {
                 console.warn(`Данные в ${filePath} не являются массивом. Файл пропущен.`);
                 currentFile++; // Move to the next file even if this one is invalid
                 continue;
            }

            // Filter for valid tag objects within the array
            const validTags = data.filter(item =>
                item && // Check if item exists
                typeof item.name === 'string' && item.name.trim() && // Ensure name is a non-empty string
                item.count !== undefined && !isNaN(Number(item.count)) // Ensure count is present and numeric
            );
            allTagsRaw.push(...validTags);
            currentFile++;

        } catch (e) {
            console.error(`Ошибка загрузки или парсинга ${filePath}:`, e);
            // If the *first* file fails, it's critical, warn the user. Otherwise, just break the loop.
            if (currentFile === 1) {
                 console.warn("Не удалось загрузить базовый файл тегов (tags_1.json). Автодополнение будет недоступно.");
            }
            break; // Stop loading tags on any error
        }
    }

    // Process and sort the collected raw tags
    if (allTagsRaw.length > 0) {
        sortedTagData = allTagsRaw
            .map(tag => ({
                label: tag.name.trim().replace(/_/g, ' '), // Label for display (with spaces)
                value: tag.name.trim(),                   // Value for searching/API (original underscores)
                count: Number(tag.count)
            }))
            .filter(tag => tag.value.length > 0) // Remove tags that might become empty after trimming
             // Optional: Add a minimum count filter if desired
            // .filter(tag => tag.count >= 5)
            .sort((a, b) => b.count - a.count); // Sort by count, highest first

        console.log(`Загружено и отсортировано ${sortedTagData.length} тегов.`);
    } else {
        console.warn('Теги не загружены или массив тегов пуст. Автодополнение будет отключено.');
        sortedTagData = []; // Ensure it's an empty array if loading fails
    }
}

/**
 * Initializes the Awesomplete library on a given input element with specific filtering
 * and display logic for tag suggestions.
 * @param {HTMLInputElement} inputElement - The input field to attach Awesomplete to.
 * @param {Array} tagDataList - The pre-sorted list of tag data objects ({label, value, count}).
 * @returns {Awesomplete|null} The Awesomplete instance or null if initialization failed.
 */
function initializeAwesomplete(inputElement, tagDataList) {
    if (!inputElement) {
        console.error("Element input для Awesomplete не найден.");
        return null;
    }
    // Do not initialize if the tag list is empty
    if (!tagDataList || tagDataList.length === 0) {
         console.warn(`Список тегов пуст, Awesomplete не инициализирован для #${inputElement.id}.`);
         // Optionally disable the input or change placeholder
         // inputElement.placeholder = "Загрузка тегов не удалась";
         // inputElement.disabled = true;
         return null;
    }

    // If an Awesomplete instance already exists on this element, destroy it first
    // This is useful if tags could potentially be reloaded dynamically later
    if (inputElement.awesomplete) {
        console.log(`Уничтожение предыдущего экземпляра Awesomplete для #${inputElement.id}`);
        inputElement.awesomplete.destroy();
    }

    // Create the new Awesomplete instance
    const instance = new Awesomplete(inputElement, {
        list: tagDataList, // Provide the pre-processed and sorted tag data
        minChars: 2,       // Minimum characters to type before showing suggestions
        maxItems: 15,      // Maximum number of suggestions to display
        autoFirst: true,   // Automatically highlight the first suggestion
        sort: false,       // IMPORTANT: Disable default sorting, use the order from `list`

        /**
         * Custom filter function. Shows suggestions whose `value` (tag_name)
         * starts with the currently typed part of the tag.
         */
        filter: function (suggestion, userInput) {
            // Extract the part of the input after the last space (the current tag being typed)
            const currentTagInput = userInput.substring(userInput.lastIndexOf(' ') + 1).toLowerCase();
            // Only apply filter if the current tag part meets minChars requirement
            if (currentTagInput.length < this.minChars) {
                return false;
            }
            // Check if the suggestion's value (e.g., 'long_hair') starts with the input part (e.g., 'long')
            return suggestion.value.toLowerCase().startsWith(currentTagInput);
        },

        /**
         * Custom function to render each item in the suggestion list.
         * Highlights the matching part of the tag's label.
         */
        item: function (suggestion, userInput) {
            const currentTagInput = userInput.substring(userInput.lastIndexOf(' ') + 1).toLowerCase();
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", "false"); // Awesomplete manages this
            // Store the actual tag value (with underscores) in the dataset
            li.dataset.value = suggestion.value;

            try {
                 // Use the label (with spaces) for display text
                const label = suggestion.label;
                // Find the position of the typed input within the label (case-insensitive)
                // Use startsWith logic for highlighting correctly
                 if (label.toLowerCase().startsWith(currentTagInput)) {
                    // Highlight the part that *wasn't* typed
                    li.innerHTML = label.substring(0, currentTagInput.length) +
                                   "<mark>" + label.substring(currentTagInput.length) + "</mark>";
                } else {
                     // Fallback: If somehow a non-starting match gets through, mark the whole label
                     // This shouldn't happen with the current filter logic.
                     li.innerHTML = `<mark>${label}</mark>`;
                }
            } catch(e) {
                 // Safety net in case of unexpected errors during rendering
                 console.error("Ошибка рендеринга элемента Awesomplete:", e, suggestion, userInput);
                 li.textContent = suggestion.label || suggestion.value; // Display plain text as fallback
            }

            // Optional: Display the tag count alongside the suggestion
            // li.innerHTML += ` <span style="opacity: 0.7; font-size: 0.85em;">(${suggestion.count})</span>`;

            return li;
        },

        /**
         * Custom function to replace the input value when a suggestion is selected.
         * Replaces only the current tag fragment being typed and adds a space.
         */
        replace: function (suggestion) {
            // Get the text before the start of the current tag fragment
            const before = this.input.value.substring(0, this.input.value.lastIndexOf(' ') + 1);
            // Replace the input value with the previous tags + the selected tag's value + a space
            this.input.value = before + suggestion.value + " ";
        }
    });

    console.log(`Awesomplete инициализирован для #${inputElement.id}`);
    return instance; // Return the created instance
}


// --- Navigation and Search Logic ---

/**
 * Handles the form submission from the hero section search input.
 * Copies the query to the main search input, shows the main interface, and starts the search.
 * @param {Event} event - The form submission event.
 */
function startSearch(event) {
  event.preventDefault(); // Prevent page reload on form submission
  if (!tagsInput || !mainSearchInput || !mainInterface) return; // Safety checks

  tagsInput.value = mainSearchInput.value.trim(); // Copy query and trim whitespace
  document.body.classList.add('show-interface'); // Show the gallery view
  currentPage = 0; // Reset to the first page for a new search
  searchPosts(); // Execute the search with the copied tags
}

/**
 * Resets the application state to the initial hero screen view.
 * Clears inputs, hides the main interface, resets state variables, and updates the URL.
 */
function goHome() {
    // Clear search input fields
    if (tagsInput) tagsInput.value = '';
    if (mainSearchInput) mainSearchInput.value = '';

    // Switch view from main interface back to hero section
    document.body.classList.remove('show-interface');

    // Reset application state
    currentPage = 0;
    currentPosts = [];
    isLoading = false; // Ensure loading flag is reset

    // Clear dynamic content areas
    if (postsContainer) postsContainer.innerHTML = ''; // Clear displayed posts
    closeMediaView(); // Ensure the media viewer is closed if it was open

    // Reset the URL to the base path without search parameters
    // Use pushState here to create a distinct history entry for the home state
    updateURL({}, true); // Pass true for pushState

    window.scrollTo(0, 0); // Scroll to the top of the page
    console.log("Возврат на главную страницу.");
}

/**
 * Fetches posts from the API based on the current tags and page number.
 * Updates the UI with results, loading state, or error messages.
 * @param {string|null} [tagsToSearch=null] - Optional tags string override. If null, uses tagsInput value.
 */
async function searchPosts(tagsToSearch = null) {
    if (isLoading) {
        console.warn("Поиск уже выполняется, новый запрос проигнорирован.");
        return; // Prevent concurrent searches
    }
    if (!postsContainer) {
         console.error("Контейнер для постов (postsContainer) не найден.");
         return;
    }

    isLoading = true;
    postsContainer.innerHTML = '<p style="text-align: center; padding: 40px;">Загрузка...</p>'; // Show loading indicator

    // Determine tags to use: override or from input, then normalize spaces
    const tags = (tagsToSearch !== null ? tagsToSearch : (tagsInput ? tagsInput.value : '')).trim().replace(/\s+/g, ' ');
    currentPage = Math.max(0, currentPage); // Ensure page number is non-negative

    // Update the browser URL to reflect the current search state (using replaceState for pagination)
    updateURL({
        tags: tags ? tags.replace(/ /g, '+') : undefined, // Format tags for URL
        page: currentPage > 0 ? currentPage : undefined, // Only include page if > 0
        s: 'list', // Indicate list view state
        id: undefined // Clear any specific post ID from the URL
    });

    // Construct the API URL
    const apiUrl = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=${postsPerPage}&tags=${encodeURIComponent(tags)}&pid=${currentPage}`;
    console.log(`Запрос API: ${apiUrl}`); // Log the request URL for debugging

    try {
        const response = await fetch(apiUrl);

        // Handle network errors (status codes other than 2xx)
        if (!response.ok) {
            // Attempt to read error details if API provides them (often not the case for R34)
            let errorMsg = `Ошибка сети: ${response.status} ${response.statusText}`;
            try {
                // Try parsing as JSON, might fail if error is plain text
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg; // Use API message if available
            } catch (e) { /* Ignore JSON parse error, stick with HTTP status */ }
            throw new Error(errorMsg);
        }

        // Handle successful response (status 2xx)
        const responseText = await response.text();
        let posts = [];

        // Check for empty or minimal responses indicating no results
        if (!responseText || responseText.trim() === '' || responseText.trim() === '[]' || responseText.trim() === '{}') {
             posts = [];
             console.log("API вернул пустой ответ (нет результатов).");
        } else {
             try {
                 posts = JSON.parse(responseText);
                 // Ensure the result is always an array, even if API returns a single object
                 if (!Array.isArray(posts)) {
                     posts = posts && typeof posts === 'object' ? [posts] : [];
                 }
             } catch (e) {
                 console.error("Ошибка парсинга JSON ответа API:", e, "Ответ:", responseText);
                 throw new Error("Некорректный формат ответа от сервера.");
             }
        }

        currentPosts = posts; // Store the successfully fetched posts

        // Display the posts or a "not found" message
        if (!posts || posts.length === 0) {
            postsContainer.innerHTML =
                `<p style="text-align: center; font-size: 1.2em; color: var(--c-text); padding: 40px;">
                    По вашему запросу "${tags || 'все посты'}" ничего не найдено ${currentPage > 0 ? `на странице ${currentPage + 1}`: ''}.
                </p>`;
        } else {
            displayPosts(posts);
        }
        updatePaginator(); // Update the displayed page number

    } catch (error) {
        console.error('Ошибка при выполнении поиска постов:', error);
        postsContainer.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Ошибка загрузки постов: ${error.message}. Попробуйте еще раз.</p>`;
        currentPosts = []; // Clear posts array on error
        updatePaginator(); // Still update paginator (might show page 1)
    } finally {
        isLoading = false; // Reset loading flag regardless of outcome
        window.scrollTo(0, 0); // Scroll to the top after content update
        console.log("Запрос постов завершен.");
    }
}

/**
 * Renders the list of post thumbnails in the postsContainer.
 * @param {Array} posts - An array of post objects fetched from the API.
 */
function displayPosts(posts) {
    if (!postsContainer) return;
    postsContainer.innerHTML = ''; // Clear previous thumbnails

    const fragment = document.createDocumentFragment(); // Use DocumentFragment for performance

    posts.forEach(post => {
        // Basic validation for essential post data needed for display
        if (!post || !post.preview_url || !post.id || typeof post.width === 'undefined' || typeof post.height === 'undefined') {
            console.warn("Пропуск поста из-за отсутствия необходимых данных (preview_url, id, width, height):", post);
            return; // Skip rendering this post
        }

        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        const mediaType = getMediaType(post);
        thumb.dataset.mediaType = mediaType; // e.g., 'image', 'video', 'gif'

        // Determine aspect ratio category for potential styling hooks
        const aspectRatio = post.width / post.height;
        thumb.dataset.aspectRatio = aspectRatio < 0.75 ? 'tall' :
                                    aspectRatio > 1.5 ? 'wide' : 'normal';

        const img = document.createElement('img');
        img.src = post.preview_url;
        img.alt = `Preview for post ${post.id}`; // Add descriptive alt text
        img.loading = 'lazy'; // Enable native lazy loading

        // Use aspect-ratio CSS property for better layout stability before image loads
        img.style.aspectRatio = `${post.width}/${post.height}`;

        // Add click listener to open the media view for this post
        img.onclick = () => openMediaView(post);

        thumb.appendChild(img);
        fragment.appendChild(thumb); // Add to fragment
    });

    postsContainer.appendChild(fragment); // Append all thumbs at once
}

/**
 * Determines the media type ('image', 'video', 'gif') based on the post's file_url extension.
 * @param {object} post - The post object containing file_url.
 * @returns {string} The determined media type. Defaults to 'image'.
 */
function getMediaType(post) {
    if (!post || !post.file_url) return 'image'; // Default to image if URL is missing

    const url = post.file_url.toLowerCase();
    // Robustly extract extension, handling potential query strings or fragments
    const extension = url.split('.').pop()?.split(/[#?]/)[0] || '';

    if (extension === 'gif') return 'gif';
    // Common video extensions
    if (['mp4', 'webm', 'mov', 'avi', 'wmv', 'mkv', 'flv', 'ogv' /* Add other relevant types */].includes(extension)) return 'video';
    // Common image extensions (optional check, as default is 'image')
    // if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(extension)) return 'image';

    return 'image'; // Default to 'image' for unknown or common image types
}


// --- Media View Logic ---

/**
 * Opens the media viewer modal to display a specific post's full media and details.
 * Fetches full post data and comments if necessary.
 * @param {object} post - The post object (can be partial from thumbnail click).
 */
async function openMediaView(post) {
    if (!post || !post.id || !mediaView || !mediaContent) return; // Safety checks

    // Update URL to reflect the viewing state
    updateURL({
        s: 'view',
        id: post.id,
        tags: tagsInput.value.trim().replace(/ /g, '+') || undefined,
        page: currentPage > 0 ? currentPage : undefined
    });

    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    mediaContent.innerHTML = '<p style="padding: 30px; text-align: center;">Загрузка медиа...</p>'; // Loading indicator
    mediaView.classList.add('active'); // Show the modal

    try {
        // Check if we have full post data (tags, file_url). If not, fetch it.
        let fullPostData = post;
        if (!post.tags || !post.file_url) {
            console.log(`Неполные данные для поста ${post.id}, загрузка полной информации...`);
            const fetchedPost = await fetchPostById(post.id);
            if (!fetchedPost) {
                throw new Error("Не удалось загрузить детали поста.");
            }
            fullPostData = fetchedPost; // Use the fully fetched data

            // Optional: Update the post in the currentPosts array if it exists there
            const postIndex = currentPosts.findIndex(p => p.id == post.id);
            if (postIndex > -1) {
                currentPosts[postIndex] = fullPostData;
            }
        }

        const mediaType = getMediaType(fullPostData);

        // Create the HTML for the media element (image or video)
        // Ensure video has controls, autoplay, and playsinline. Removed muted/loop.
        const mediaElementHtml = mediaType === 'video'
            ? `<video controls autoplay playsinline preload="metadata" src="${fullPostData.file_url}" type="video/${fullPostData.file_url.split('.').pop() || 'mp4'}">Ваш браузер не поддерживает тег video.</video>`
            : `<img src="${fullPostData.file_url}" alt="Пост ${fullPostData.id}">`; // GIF is handled like an image here

        // Fetch comments for the post
        const comments = await fetchComments(fullPostData.id);
        // Prepare tags for display
        const tags = (fullPostData.tags || '').split(' ').filter(t => t.trim()); // Ensure array, remove empty strings

        // Construct the inner HTML for the media content area
        mediaContent.innerHTML = `
            ${mediaElementHtml}
            <div class="media-info">
              <div class="tag-list ${tags.length > 10 ? 'collapsed' : ''}">
                ${tags.map(tag =>
                    // Escape single quotes in tag names for the onclick attribute
                    `<button class="tag" onclick="replaceSearchWithTag('${tag.replace(/'/g, "\\'")}')">${tag.replace(/_/g, ' ')}</button>`
                ).join('')}
                ${tags.length > 10 ?
                  `<button class="show-more-tags" onclick="expandTags(this)">
                    Показать ещё (${tags.length - 10})
                  </button>` : ''}
              </div>
              <div class="comments-section">
                <h4>Комментарии (${comments.length}):</h4>
                <div id="commentList"> <!-- Container for comments -->
                ${comments.length > 0 ?
                  comments.map(c => `
                    <div class="comment">
                      <strong>${sanitizeHtml(c.owner) || 'Аноним'}:</strong>
                      <span class="comment-text">${sanitizeHtml(c.body)}</span>
                    </div>
                  `).join('')
                  : '<p>Комментариев пока нет.</p>'}
                </div>
              </div>
            </div>
        `;

        // Attempt to play video automatically (browser might block if unmuted)
        const videoElement = mediaContent.querySelector('video');
        if (videoElement) {
             console.log("Попытка автовоспроизведения видео...");
             videoElement.play().catch(err => {
                 console.warn("Автовоспроизведение видео (возможно, со звуком) заблокировано браузером:", err.name, err.message);
                 // User will need to manually click play in this case.
             });
        }

        mediaView.focus(); // Set focus to the modal for keyboard controls (like Escape)

    } catch (error) {
        console.error("Ошибка при открытии/загрузке медиа:", error);
        mediaContent.innerHTML = `<p style="color: red; padding: 30px; text-align: center;">Ошибка загрузки медиа: ${error.message}</p>`;
    }
}

/**
 * Closes the media viewer modal, stops video playback, and restores the URL/scrolling.
 */
function closeMediaView() {
    if (!mediaView || !mediaContent) return;

    // Stop video playback and clear source to release resources
    const video = mediaContent.querySelector('video');
    if (video) {
        video.pause();
        video.removeAttribute('src'); // Remove src to stop potential background loading
        video.load(); // Reset the media element
    }

    mediaView.classList.remove('active'); // Hide the modal
    document.body.style.overflow = ''; // Restore background scrolling
    mediaContent.innerHTML = ''; // Clear the modal content

    // Restore URL state to 'list' view, keeping current tags/page
    updateURL({
        s: 'list',
        id: undefined, // Remove post ID
        tags: tagsInput.value.trim().replace(/ /g, '+') || undefined,
        page: currentPage > 0 ? currentPage : undefined
    });
    console.log("Медиа просмотр закрыт.");
}

/**
 * Fetches full details for a single post by its ID from the API.
 * @param {string|number} postId - The ID of the post to fetch.
 * @returns {Promise<object|null>} A promise resolving to the post object or null if not found/error.
 */
async function fetchPostById(postId) {
    if (!postId) {
        console.warn("fetchPostById вызван без ID.");
        return null;
    }
    const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&id=${postId}`;
    console.log(`Запрос деталей поста ID ${postId}: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Handle cases where API returns error status but maybe still valid (though unlikely)
            console.error(`Ошибка сети (${response.status}) при запросе поста ID ${postId}`);
            return null; // Treat network errors as post not found for simplicity here
        }
        // R34 API might return an empty array `[]` or sometimes an empty object `{}` if not found.
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '[]' || responseText.trim() === '{}') {
            console.log(`Пост ID ${postId} не найден (пустой ответ).`);
            return null;
        }
        const posts = JSON.parse(responseText);
        // Expect an array, take the first element. Handle single object case too.
        const postData = Array.isArray(posts) ? posts[0] : (posts && typeof posts === 'object' ? posts : null);

        if (!postData || !postData.id) { // Check if we got a valid post object back
             console.log(`Пост ID ${postId} не найден (невалидный ответ).`);
             return null;
        }
        console.log(`Детали поста ID ${postId} успешно загружены.`);
        return postData;

    } catch (error) {
        console.error(`Критическая ошибка при загрузке поста ID ${postId}:`, error);
        return null; // Return null on fetch/parse errors
    }
}

/**
 * Fetches comments for a given post ID. Note: R34 comment API returns XML.
 * @param {string|number} postId - The ID of the post for which to fetch comments.
 * @returns {Promise<Array>} A promise resolving to an array of comment objects ({owner, body}).
 */
async function fetchComments(postId) {
    if (!postId) return []; // Return empty array if no postId provided
    const url = `https://api.rule34.xxx/index.php?page=dapi&s=comment&q=index&post_id=${postId}`;
    console.log(`Запрос комментариев для поста ${postId}: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Ошибка сети (${response.status}) при загрузке комментариев`);
        }
        const text = await response.text();

        // Handle empty XML response (no comments)
        if (!text || text.trim() === '' || text.includes('<comments />') || text.includes('<comments/>')) {
            console.log(`Комментарии для поста ${postId} отсутствуют.`);
            return [];
        }

        // Parse the XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "application/xml");

        // Check for XML parsing errors
         const parserError = xmlDoc.querySelector("parsererror");
         if (parserError) {
             console.error("Ошибка парсинга XML комментариев:", parserError.textContent);
             throw new Error("Не удалось обработать ответ комментариев (ошибка парсинга XML).");
         }

        // Extract comment data from XML elements
        const commentElements = xmlDoc.getElementsByTagName('comment');
        const comments = Array.from(commentElements).map(el => ({
            owner: el.getAttribute('creator') || 'Аноним', // Use 'Аноним' if creator attribute is missing
            body: el.getAttribute('body') || ''          // Use empty string if body attribute is missing
        })).filter(c => c.body.trim() !== ''); // Filter out any comments that might be effectively empty

        console.log(`Загружено ${comments.length} комментариев для поста ${postId}.`);
        return comments;

    } catch (error) {
        console.error(`Ошибка при загрузке/обработке комментариев для поста ${postId}:`, error);
        return []; // Return empty array on any error
    }
}

/**
 * Basic HTML sanitizer to prevent XSS by escaping < and > characters.
 * For more robust sanitization, a library like DOMPurify is recommended.
 * @param {string} str - The input string to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeHtml(str) {
    if (typeof str !== 'string') return ''; // Return empty if input is not a string
    return str.replace(/</g, '<').replace(/>/g, '>');
}


// --- UI Interaction ---

/**
 * Navigates to the previous or next page of results.
 * @param {number} direction - -1 for previous page, 1 for next page.
 */
function changePage(direction) {
    const potentialNewPage = currentPage + direction;
    if (potentialNewPage >= 0) { // Prevent going to negative pages
        currentPage = potentialNewPage;
        searchPosts(); // Fetch and display posts for the new page
    } else {
        console.log("Уже на первой странице."); // Optional feedback
    }
}

/**
 * Updates the pagination display (the editable page number span).
 */
function updatePaginator() {
    if (currentPageSpan) {
        currentPageSpan.textContent = currentPage + 1; // Display 1-based page number
    }
}

/**
 * Handles keydown events on the editable page number span.
 * Allows numbers, navigation keys, and triggers update on Enter.
 * @param {KeyboardEvent} event - The keydown event.
 */
function handlePageInput(event) {
    // Allow digits, Backspace, Delete, Arrow keys, Enter, Tab
    if (!/^[0-9]$/.test(event.key) &&
        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Home', 'End'].includes(event.key))
    {
         event.preventDefault(); // Block other keys
    }
    // Trigger page update and blur on Enter key
    if (event.key === 'Enter') {
        event.preventDefault();
        updatePageFromInput();
        event.target.blur(); // Remove focus from the span
    }
}

/**
 * Reads the value from the editable page number span, validates it,
 * and triggers a search for that page if it's valid and different.
 */
function updatePageFromInput() {
    if (!currentPageSpan) return;
    const pageText = currentPageSpan.textContent.trim();
    const newPage = parseInt(pageText, 10) - 1; // Convert 1-based input to 0-based index

    // Validate the parsed page number
    if (!isNaN(newPage) && newPage >= 0 && newPage !== currentPage) {
        console.log(`Переход на страницу ${newPage + 1} через ввод.`);
        currentPage = newPage;
        searchPosts(); // Fetch and display the requested page
    } else {
        // If input is invalid or unchanged, reset the display to the current page number
        console.warn(`Введен неверный номер страницы: "${pageText}". Возврат к странице ${currentPage + 1}.`);
        currentPageSpan.textContent = currentPage + 1;
    }
}

/**
 * Expands a collapsed tag list in the media view by removing the 'collapsed' class
 * and the 'Show More' button.
 * @param {HTMLButtonElement} button - The 'Show More' button that was clicked.
 */
function expandTags(button) {
    const tagList = button.closest('.tag-list'); // Find the parent tag list container
    if (tagList) {
        tagList.classList.remove('collapsed'); // Remove the class hiding extra tags
        console.log("Список тегов развернут.");
    } else {
         console.warn("Не найден родительский '.tag-list' для кнопки 'Показать ещё'.");
    }
    button.remove(); // Remove the button itself
}

/**
 * Toggles the visibility of the sidebar and saves the state in localStorage.
 */
function toggleSidebar() {
    if (!sidebar) return;
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'block' : 'none'; // Toggle display
    try { // Use try-catch for localStorage access (e.g., private browsing)
        localStorage.setItem('sidebarHidden', !isHidden); // Save the new state (true if hidden)
        console.log(`Сайдбар ${isHidden ? 'показан' : 'скрыт'}. Состояние сохранено.`);
    } catch (e) {
        console.warn("Не удалось сохранить состояние сайдбара в localStorage:", e);
    }
}

/**
 * Replaces the entire content of the main search input with a single tag
 * and initiates a search for that tag.
 * @param {string} tag - The tag to search for.
 */
function replaceSearchWithTag(tag) {
    if (!tagsInput) return;
    const cleanTag = tag.trim();
    if (!cleanTag) {
        console.warn("Попытка поиска пустого тега.");
        return;
    }
    console.log(`Поиск по тегу: ${cleanTag}`);
    tagsInput.value = cleanTag; // Set the input value
    currentPage = 0; // Reset to the first page
    closeMediaView(); // Close media viewer if open
    searchPosts(); // Start the search
}

/**
 * Adds a tag to the existing tags in the main search input (if not already present)
 * and initiates a search.
 * @param {string} tagToAdd - The tag to add to the search query.
 */
function addTagToSearch(tagToAdd) {
    if (!tagsInput) return;
    const cleanTagToAdd = tagToAdd.trim();
    if (!cleanTagToAdd) {
        console.warn("Попытка добавить пустой тег.");
        return;
    }

    // Get current tags, split by space, filter out empty strings
    const currentTags = tagsInput.value.trim().split(' ').filter(t => t.length > 0);

    // Add the new tag only if it's not already in the list
    if (!currentTags.includes(cleanTagToAdd)) {
        currentTags.push(cleanTagToAdd); // Add the new tag
        tagsInput.value = currentTags.join(' '); // Update input value
        currentPage = 0; // Reset to the first page
        closeMediaView(); // Close media viewer if open
        console.log(`Тег "${cleanTagToAdd}" добавлен. Новый поиск: ${tagsInput.value}`);
        searchPosts(); // Start the search with updated tags
    } else {
         console.log(`Тег "${cleanTagToAdd}" уже присутствует в поиске.`);
         tagsInput.focus(); // Optionally focus the input to indicate it's already there
    }
}


// --- URL Handling ---

/**
 * Updates the browser's URL query parameters without a full page reload.
 * Uses replaceState by default, or pushState if specified (for major state changes like initial search/goHome).
 * @param {object} params - Key-value pairs of parameters to set (e.g., {tags: '...', page: 1}).
 * @param {boolean} [usePushState=false] - If true, use pushState to create a new history entry.
 */
function updateURL(params = {}, forcePush = false) {
  try {
    const url = new URL(window.location); // Get current URL object

    // Define the keys we manage in the URL
    const managedKeys = ['tags', 'page', 'id', 's'];

    // --- Build the target URL ---
    const targetUrl = new URL(window.location); // Start with current
    // Clear existing managed parameters first
    managedKeys.forEach(key => targetUrl.searchParams.delete(key));
    // Add new parameters if they have a meaningful value
    Object.entries(params).forEach(([key, value]) => {
        if (managedKeys.includes(key) && value !== undefined && value !== null && value !== '') {
            // Special handling for tags: ensure '+' encoding if needed (though encodeURIComponent usually handles it)
            // const encodedValue = (key === 'tags') ? value.replace(/ /g, '+') : value;
            targetUrl.searchParams.set(key, value);
        }
    });
    const newUrlString = targetUrl.toString();
    // --- End Build the target URL ---


    // Only push state if the new URL is different from the current one, OR if forcePush is true
    if (forcePush || newUrlString !== window.location.href) {
        // Use pushState to add a new entry to the browser's history
        history.pushState(
            params, // Store the parameters object as the state associated with this history entry
            '',     // title (currently unused by browsers, but required)
            newUrlString // The new URL to display
        );
        console.log(`URL pushed: ${newUrlString}`); // Log for debugging
    } else {
         console.log(`URL не изменился, pushState пропущен: ${newUrlString}`); // Log if skipped
    }

  } catch (error) {
      console.error("Ошибка обновления URL:", error);
  }
}

/**
 * Parses the current URL's query parameters and returns them as an object.
 * @returns {object} An object containing parameters like tags, page, postId, s.
 */
function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    tags: params.get('tags') ? params.get('tags').replace(/\+/g, ' ') : '', // Decode + back to space
    // Ensure page is a non-negative integer, defaulting to 0
    page: Math.max(0, parseInt(params.get('page'), 10) || 0),
    postId: params.get('id') || null, // Post ID for viewing
    s: params.get('s') || null // State ('list' or 'view')
  };
}

/**
 * Handles the initial page load logic based on URL parameters.
 * Determines whether to show the hero section, the list view, or the media view.
 */
async function handleInitialLoad() {
    console.log("Обработка начальной загрузки по URL...");
    const params = getURLParams();
    console.log("Параметры URL:", params);

    // If the URL specifies a state ('list' or 'view') or has tags, show the main interface
    if (params.s || params.tags) {
        document.body.classList.add('show-interface'); // Show gallery view
        if (tagsInput) tagsInput.value = params.tags; // Set search input from URL tags
        currentPage = params.page; // Set current page from URL

        // If the state is 'view' and a post ID is present, try to show the media view
        if (params.s === 'view' && params.postId) {
            console.log(`Попытка прямого открытия поста ID ${params.postId}`);
            // Fetch the specific post data needed for the view
            const postToView = await fetchPostById(params.postId);
            if (postToView) {
                // Store this post temporarily so back/forward might work (though full context isn't loaded)
                currentPosts = [postToView];
                await openMediaView(postToView); // Open the media view directly
                // Don't proceed to load the list view in this case
                console.log("Медиа просмотр открыт по URL.");
                return; // Stop further processing
            } else {
                // If the specified post ID wasn't found, fall back to list view
                console.warn(`Пост ID ${params.postId} из URL не найден. Отображение списка.`);
                // Correct the URL state to 'list' and remove the invalid 'id'
                updateURL({ s: 'list', id: undefined, tags: params.tags ? params.tags.replace(/ /g, '+') : undefined, page: params.page > 0 ? params.page : undefined });
                await searchPosts(params.tags); // Load the list view based on tags
            }
        } else {
            // If state is 'list' or only tags are present, load the list view
            console.log("Загрузка списка постов по URL.");
            await searchPosts(params.tags);
        }
    } else {
        // If no relevant parameters, show the default hero section
        console.log("Параметры поиска/вида в URL не найдены. Отображение главной страницы.");
        document.body.classList.remove('show-interface');
    }
     // Update paginator display based on initial currentPage
     updatePaginator();
}


// --- Event Listeners Setup ---

/**
 * Attaches core event listeners to DOM elements.
 */
function setupEventListeners() {
    // Browser back/forward navigation
    window.addEventListener('popstate', async (event) => {
        console.log("Событие Popstate:", event.state); // Log state associated with history entry
        // Re-run the initial load logic to adapt to the new URL state
        await handleInitialLoad();
    });

    // Close media view by clicking the background overlay
    if (mediaView) {
        mediaView.addEventListener('click', function(e) {
            // Check if the click target is the overlay itself, not content inside it
            if (e.target === mediaView) {
                closeMediaView();
            }
        });
    }

    // Global keydown listener (e.g., for Escape key)
    document.addEventListener('keydown', function(e) {
        // Close media view on Escape key press
        if (e.key === 'Escape' && mediaView && mediaView.classList.contains('active')) {
            closeMediaView();
        }
        // Add other global keyboard shortcuts here if needed
    });

    // Go home when clicking the site title
    if (siteTitle) {
        siteTitle.addEventListener('click', goHome);
    }

    // Awesomplete selection listener (optional, if needed beyond form submit)
    // Example: Trigger search immediately when a suggestion is selected
    [mainSearchInput, tagsInput].forEach(input => {
        if (input) {
            input.addEventListener('awesomplete-selectcomplete', function() {
                console.log(`Выбрана подсказка Awesomplete для #${input.id}`);
                // Decide if search should trigger here. Usually form submit is sufficient.
                // If triggering here, ensure it doesn't conflict with the replace function adding a space.
                // Might need a small delay or different logic.
                 if(input.id === 'tagsInput') {
                     // Maybe trigger search for the main input?
                     // searchPosts();
                 }
            });
        }
    });

    // Note: Form submission listeners are handled inline in the HTML (onsubmit="")
    // Pagination clicks and sidebar toggle are also handled inline (onclick="")
    // Editable page span listeners (onkeydown, onblur) are also inline

    console.log("Основные обработчики событий установлены.");
}

// === End of js/main.js ===
