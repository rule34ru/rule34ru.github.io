// js/main.js

// --- State Variables ---
let currentPage = 0;
const postsPerPage = 42;
let sortedTagData = [];
let currentPosts = [];
let isLoading = false;
let awesompleteInstances = {};

// --- DOM Element References ---
const mainSearchInput = document.getElementById('mainSearchInput');
const tagsInput = document.getElementById('tagsInput');
const postsContainer = document.getElementById('postsContainer');
const mediaView = document.getElementById('mediaView');
const mediaContent = document.getElementById('mediaContent');
const currentPageSpan = document.getElementById('currentPage');
const sidebar = document.getElementById('sidebar');
const siteTitle = document.getElementById('site-title');
const heroSection = document.querySelector('.hero-section');
const mainInterface = document.querySelector('.main-interface');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed.');
    if (!mainSearchInput || !tagsInput || !postsContainer || !mediaView || !mediaContent || !currentPageSpan || !sidebar || !siteTitle || !heroSection || !mainInterface) {
        console.error("Не все необходимые DOM элементы найдены! Проверьте HTML структуру и ID.");
        document.body.innerHTML = '<p style="color: red; text-align: center; padding: 50px;">Ошибка: Не удалось загрузить интерфейс. Пожалуйста, проверьте консоль разработчика.</p>';
        return;
    }

    try {
        if (localStorage.getItem('sidebarHidden') === 'true') {
            sidebar.style.display = 'none';
        }

        await loadAndPrepareTags();
        awesompleteInstances.main = initializeAwesomplete(mainSearchInput, sortedTagData);
        awesompleteInstances.tags = initializeAwesomplete(tagsInput, sortedTagData);

        await handleInitialLoad();

        setupEventListeners();

        console.log('Инициализация завершена успешно.');

    } catch (error) {
        console.error('Глобальная ошибка инициализации:', error);
        const errorDisplayArea = postsContainer || mainInterface || document.body;
        errorDisplayArea.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Ошибка загрузки приложения: ${error.message}. Попробуйте обновить страницу.</p>`;
    }
});

async function loadAndPrepareTags() {
    console.log('Загрузка тегов...');
    let currentFile = 1;
    const allTagsRaw = [];
    const MAX_TAG_FILES = 20;
    const tagsBaseUrl = 'tags8/';

    while (currentFile <= MAX_TAG_FILES) {
        const filePath = `${tagsBaseUrl}tags_${currentFile}.json`;
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                if (response.status === 404 && currentFile > 1) {
                    console.log(`Файл ${filePath} не найден, завершение загрузки тегов.`);
                    break;
                }
                throw new Error(`HTTP error! status: ${response.status} при загрузке ${filePath}`);
            }
            const data = await response.json();

            if (!Array.isArray(data)) {
                 console.warn(`Данные в ${filePath} не являются массивом. Файл пропущен.`);
                 currentFile++;
                 continue;
            }

            const validTags = data.filter(item =>
                item &&
                typeof item.name === 'string' && item.name.trim() &&
                item.count !== undefined && !isNaN(Number(item.count))
            );
            allTagsRaw.push(...validTags);
            currentFile++;

        } catch (e) {
            console.error(`Ошибка загрузки или парсинга ${filePath}:`, e);
            if (currentFile === 1) {
                 console.warn("Не удалось загрузить базовый файл тегов (tags_1.json). Автодополнение будет недоступно.");
            }
            break;
        }
    }

    if (allTagsRaw.length > 0) {
        sortedTagData = allTagsRaw
            .map(tag => ({
                label: tag.name.trim().replace(/_/g, ' '),
                value: tag.name.trim(),
                count: Number(tag.count)
            }))
            .filter(tag => tag.value.length > 0)
            .sort((a, b) => b.count - a.count);

        console.log(`Загружено и отсортировано ${sortedTagData.length} тегов.`);
    } else {
        console.warn('Теги не загружены или массив тегов пуст. Автодополнение будет отключено.');
        sortedTagData = [];
    }
}

function initializeAwesomplete(inputElement, tagDataList) {
    if (!inputElement) {
        console.error("Element input для Awesomplete не найден.");
        return null;
    }
    if (!tagDataList || tagDataList.length === 0) {
         console.warn(`Список тегов пуст, Awesomplete не инициализирован для #${inputElement.id}.`);
         return null;
    }

    if (inputElement.awesomplete) {
        console.log(`Уничтожение предыдущего экземпляра Awesomplete для #${inputElement.id}`);
        inputElement.awesomplete.destroy();
    }

    const instance = new Awesomplete(inputElement, {
        list: tagDataList,
        minChars: 2,
        maxItems: 15,
        autoFirst: true,
        sort: false,
        filter: function (suggestion, userInput) {
            const currentTagInput = userInput.substring(userInput.lastIndexOf(' ') + 1).toLowerCase();
            if (currentTagInput.length < this.minChars) {
                return false;
            }
            return suggestion.value.toLowerCase().startsWith(currentTagInput);
        },
        item: function (suggestion, userInput) {
            const currentTagInput = userInput.substring(userInput.lastIndexOf(' ') + 1).toLowerCase();
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", "false");
            li.dataset.value = suggestion.value;

            try {
                const label = suggestion.label;
                 if (label.toLowerCase().startsWith(currentTagInput)) {
                    li.innerHTML = label.substring(0, currentTagInput.length) +
                                   "<mark>" + label.substring(currentTagInput.length) + "</mark>";
                } else {
                     li.innerHTML = `<mark>${label}</mark>`;
                }
            } catch(e) {
                 console.error("Ошибка рендеринга элемента Awesomplete:", e, suggestion, userInput);
                 li.textContent = suggestion.label || suggestion.value;
            }
            return li;
        },
        replace: function (suggestion) {
            const before = this.input.value.substring(0, this.input.value.lastIndexOf(' ') + 1);
            this.input.value = before + suggestion.value + " ";
        }
    });

    console.log(`Awesomplete инициализирован для #${inputElement.id}`);
    return instance;
}


function startSearch(event) {
  event.preventDefault();
  if (!tagsInput || !mainSearchInput || !mainInterface) return;

  tagsInput.value = mainSearchInput.value.trim();
  document.body.classList.add('show-interface');
  currentPage = 0;
  updateURL({
      tags: tagsInput.value.trim().replace(/ /g, '+') || undefined,
      page: undefined,
      s: 'list',
      id: undefined
  }, true);
  searchPosts();
}

function goHome() {
    if (tagsInput) tagsInput.value = '';
    if (mainSearchInput) mainSearchInput.value = '';

    document.body.classList.remove('show-interface');

    currentPage = 0;
    currentPosts = [];
    isLoading = false;

    if (postsContainer) postsContainer.innerHTML = '';
    closeMediaView();

    updateURL({}, true);

    window.scrollTo(0, 0);
    console.log("Возврат на главную страницу.");
}

async function searchPosts(tagsToSearch = null) {
    if (isLoading) {
        console.warn("Поиск уже выполняется, новый запрос проигнорирован.");
        return;
    }
    if (!postsContainer) {
         console.error("Контейнер для постов (postsContainer) не найден.");
         return;
    }

    isLoading = true;
    postsContainer.innerHTML = '<p style="text-align: center; padding: 40px;">Загрузка...</p>';

    const tags = (tagsToSearch !== null ? tagsToSearch : (tagsInput ? tagsInput.value : '')).trim().replace(/\s+/g, ' ');
    currentPage = Math.max(0, currentPage);

    updateURL({
        tags: tags ? tags.replace(/ /g, '+') : undefined,
        page: currentPage > 0 ? currentPage : undefined,
        s: 'list',
        id: undefined
    });

    const apiUrl = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=${postsPerPage}&tags=${encodeURIComponent(tags)}&pid=${currentPage}`;
    console.log(`Запрос API: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
            let errorMsg = `Ошибка сети: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) { }
            throw new Error(errorMsg);
        }

        const responseText = await response.text();
        let posts = [];

        if (!responseText || responseText.trim() === '' || responseText.trim() === '[]' || responseText.trim() === '{}') {
             posts = [];
             console.log("API вернул пустой ответ (нет результатов).");
        } else {
             try {
                 posts = JSON.parse(responseText);
                 if (!Array.isArray(posts)) {
                     posts = posts && typeof posts === 'object' ? [posts] : [];
                 }
             } catch (e) {
                 console.error("Ошибка парсинга JSON ответа API:", e, "Ответ:", responseText);
                 throw new Error("Некорректный формат ответа от сервера.");
             }
        }

        currentPosts = posts;

        if (!posts || posts.length === 0) {
            postsContainer.innerHTML =
                `<p style="text-align: center; font-size: 1.2em; color: var(--c-text); padding: 40px;">
                    По вашему запросу "${tags || 'все посты'}" ничего не найдено ${currentPage > 0 ? `на странице ${currentPage + 1}`: ''}.
                </p>`;
        } else {
            displayPosts(posts);
        }
        updatePaginator();

    } catch (error) {
        console.error('Ошибка при выполнении поиска постов:', error);
        postsContainer.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Ошибка загрузки постов: ${error.message}. Попробуйте еще раз.</p>`;
        currentPosts = [];
        updatePaginator();
    } finally {
        isLoading = false;
        window.scrollTo(0, 0);
        console.log("Запрос постов завершен.");
    }
}

function displayPosts(posts) {
    if (!postsContainer) return;
    postsContainer.innerHTML = '';

    const fragment = document.createDocumentFragment();

    posts.forEach(post => {
        if (!post || !post.preview_url || !post.id || typeof post.width === 'undefined' || typeof post.height === 'undefined') {
            console.warn("Пропуск поста из-за отсутствия необходимых данных (preview_url, id, width, height):", post);
            return;
        }

        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        const mediaType = getMediaType(post);
        thumb.dataset.mediaType = mediaType;

        const aspectRatio = post.width / post.height;
        thumb.dataset.aspectRatio = aspectRatio < 0.75 ? 'tall' :
                                    aspectRatio > 1.5 ? 'wide' : 'normal';

        const img = document.createElement('img');
        img.src = post.preview_url;
        img.alt = `Preview for post ${post.id}`;
        img.loading = 'lazy';
        img.style.aspectRatio = `${post.width}/${post.height}`;
        img.onclick = () => openMediaView(post);

        thumb.appendChild(img);
        fragment.appendChild(thumb);
    });

    postsContainer.appendChild(fragment);
}

function getMediaType(post) {
    if (!post || !post.file_url) return 'image';

    const url = post.file_url.toLowerCase();
    const extension = url.split('.').pop()?.split(/[#?]/)[0] || '';

    if (extension === 'gif') return 'gif';
    if (['mp4', 'webm', 'mov', 'avi', 'wmv', 'mkv', 'flv', 'ogv'].includes(extension)) return 'video';

    return 'image';
}


async function openMediaView(post) {
    if (!post || !post.id || !mediaView || !mediaContent) return;

    updateURL({
        s: 'view',
        id: post.id,
        tags: tagsInput.value.trim().replace(/ /g, '+') || undefined,
        page: currentPage > 0 ? currentPage : undefined
    });

    document.body.style.overflow = 'hidden';
    mediaContent.innerHTML = '<p style="padding: 30px; text-align: center;">Загрузка медиа...</p>';
    mediaView.classList.add('active');

    try {
        let fullPostData = post;
        if (!post.tags || !post.file_url) {
            console.log(`Неполные данные для поста ${post.id}, загрузка полной информации...`);
            const fetchedPost = await fetchPostById(post.id);
            if (!fetchedPost) {
                throw new Error("Не удалось загрузить детали поста.");
            }
            fullPostData = fetchedPost;

            const postIndex = currentPosts.findIndex(p => p.id == post.id);
            if (postIndex > -1) {
                currentPosts[postIndex] = fullPostData;
            }
        }

        const mediaType = getMediaType(fullPostData);

        const mediaElementHtml = mediaType === 'video'
            ? `<video controls autoplay playsinline preload="metadata" src="${fullPostData.file_url}" type="video/${fullPostData.file_url.split('.').pop() || 'mp4'}">Ваш браузер не поддерживает тег video.</video>`
            : `<img src="${fullPostData.file_url}" alt="Пост ${fullPostData.id}">`;

        const comments = await fetchComments(fullPostData.id);
        const tags = (fullPostData.tags || '').split(' ').filter(t => t.trim());

        mediaContent.innerHTML = `
            ${mediaElementHtml}
            <div class="media-info">
              <div class="tag-list ${tags.length > 10 ? 'collapsed' : ''}">
                ${tags.map(tag =>
                    `<button class="tag" onclick="replaceSearchWithTag('${tag.replace(/'/g, "\\'")}')">${tag.replace(/_/g, ' ')}</button>`
                ).join('')}
                ${tags.length > 10 ?
                  `<button class="show-more-tags" onclick="expandTags(this)">
                    Показать ещё (${tags.length - 10})
                  </button>` : ''}
              </div>
              <div class="comments-section">
                <h4>Комментарии (${comments.length}):</h4>
                <div id="commentList">
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

        const videoElement = mediaContent.querySelector('video');
        if (videoElement) {
             console.log("Попытка автовоспроизведения видео...");
             videoElement.play().catch(err => {
                 console.warn("Автовоспроизведение видео (возможно, со звуком) заблокировано браузером:", err.name, err.message);
             });
        }

        mediaView.focus();

    } catch (error) {
        console.error("Ошибка при открытии/загрузке медиа:", error);
        mediaContent.innerHTML = `<p style="color: red; padding: 30px; text-align: center;">Ошибка загрузки медиа: ${error.message}</p>`;
    }
}

function closeMediaView() {
    if (!mediaView || !mediaContent) return;

    const video = mediaContent.querySelector('video');
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    mediaView.classList.remove('active');
    document.body.style.overflow = '';
    mediaContent.innerHTML = '';

    updateURL({
        s: 'list',
        id: undefined,
        tags: tagsInput.value.trim().replace(/ /g, '+') || undefined,
        page: currentPage > 0 ? currentPage : undefined
    });
    console.log("Медиа просмотр закрыт.");
}

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
            console.error(`Ошибка сети (${response.status}) при запросе поста ID ${postId}`);
            return null;
        }
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '[]' || responseText.trim() === '{}') {
            console.log(`Пост ID ${postId} не найден (пустой ответ).`);
            return null;
        }
        const posts = JSON.parse(responseText);
        const postData = Array.isArray(posts) ? posts[0] : (posts && typeof posts === 'object' ? posts : null);

        if (!postData || !postData.id) {
             console.log(`Пост ID ${postId} не найден (невалидный ответ).`);
             return null;
        }
        console.log(`Детали поста ID ${postId} успешно загружены.`);
        return postData;

    } catch (error) {
        console.error(`Критическая ошибка при загрузке поста ID ${postId}:`, error);
        return null;
    }
}

async function fetchComments(postId) {
    if (!postId) return [];
    const url = `https://api.rule34.xxx/index.php?page=dapi&s=comment&q=index&post_id=${postId}`;
    console.log(`Запрос комментариев для поста ${postId}: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Ошибка сети (${response.status}) при загрузке комментариев`);
        }
        const text = await response.text();

        if (!text || text.trim() === '' || text.includes('<comments />') || text.includes('<comments/>')) {
            console.log(`Комментарии для поста ${postId} отсутствуют.`);
            return [];
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "application/xml");

         const parserError = xmlDoc.querySelector("parsererror");
         if (parserError) {
             console.error("Ошибка парсинга XML комментариев:", parserError.textContent);
             throw new Error("Не удалось обработать ответ комментариев (ошибка парсинга XML).");
         }

        const commentElements = xmlDoc.getElementsByTagName('comment');
        const comments = Array.from(commentElements).map(el => ({
            owner: el.getAttribute('creator') || 'Аноним',
            body: el.getAttribute('body') || ''
        })).filter(c => c.body.trim() !== '');

        console.log(`Загружено ${comments.length} комментариев для поста ${postId}.`);
        return comments;

    } catch (error) {
        console.error(`Ошибка при загрузке/обработке комментариев для поста ${postId}:`, error);
        return [];
    }
}

/**
 * Basic HTML sanitizer with extended BB-code support to prevent XSS.
 * Supports: [b], [i], [bold], [italic], [u], [s], [strike], [small], [sup], [sub], [ins], [del]
 * For more robust sanitization, a library like DOMPurify is recommended.
 * @param {string} str - The input string to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeHtml(str) {
    if (typeof str !== 'string') return '';

    let escapedStr = str.replace(/</g, '<').replace(/>/g, '>');

    // BB-code replacements
    const bbCodeTags = [
        { bbTag: 'b', htmlTag: 'b' },
        { bbTag: 'i', htmlTag: 'i' },
        { bbTag: 'bold', htmlTag: 'b' },
        { bbTag: 'italic', htmlTag: 'i' },
        { bbTag: 'u', htmlTag: 'u' },
        { bbTag: 's', htmlTag: 's' },
        { bbTag: 'strike', htmlTag: 's' },
        { bbTag: 'small', htmlTag: 'small' },
        { bbTag: 'sup', htmlTag: 'sup' },
        { bbTag: 'sub', htmlTag: 'sub' },
        { bbTag: 'ins', htmlTag: 'ins' },
        { bbTag: 'del', htmlTag: 'del' },
    ];

    bbCodeTags.forEach(tag => {
        const regex = new RegExp(`\\[${tag.bbTag}\\](.*?)\\[\\/${tag.bbTag}\\]`, 'gs');
        escapedStr = escapedStr.replace(regex, `<${tag.htmlTag}>$1</${tag.htmlTag}>`);
    });

    return escapedStr;
}


// --- UI Interaction ---

function changePage(direction) {
    const potentialNewPage = currentPage + direction;
    if (potentialNewPage >= 0) {
        currentPage = potentialNewPage;
        searchPosts();
    } else {
        console.log("Уже на первой странице.");
    }
}

function updatePaginator() {
    if (currentPageSpan) {
        currentPageSpan.textContent = currentPage + 1;
    }
}

function handlePageInput(event) {
    if (!/^[0-9]$/.test(event.key) &&
        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Home', 'End'].includes(event.key))
    {
         event.preventDefault();
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        updatePageFromInput();
        event.target.blur();
    }
}

function updatePageFromInput() {
    if (!currentPageSpan) return;
    const pageText = currentPageSpan.textContent.trim();
    const newPage = parseInt(pageText, 10) - 1;

    if (!isNaN(newPage) && newPage >= 0 && newPage !== currentPage) {
        console.log(`Переход на страницу ${newPage + 1} через ввод.`);
        currentPage = newPage;
        searchPosts();
    } else {
        console.warn(`Введен неверный номер страницы: "${pageText}". Возврат к странице ${currentPage + 1}.`);
        currentPageSpan.textContent = currentPage + 1;
    }
}

function expandTags(button) {
    const tagList = button.closest('.tag-list');
    if (tagList) {
        tagList.classList.remove('collapsed');
        console.log("Список тегов развернут.");
    } else {
         console.warn("Не найден родительский '.tag-list' для кнопки 'Показать ещё'.");
    }
    button.remove();
}

function toggleSidebar() {
    if (!sidebar) return;
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'block' : 'none';
    try {
        localStorage.setItem('sidebarHidden', !isHidden);
        console.log(`Сайдбар ${isHidden ? 'показан' : 'скрыт'}. Состояние сохранено.`);
    } catch (e) {
        console.warn("Не удалось сохранить состояние сайдбара в localStorage:", e);
    }
}

function replaceSearchWithTag(tag) {
    if (!tagsInput) return;
    const cleanTag = tag.trim();
    if (!cleanTag) {
        console.warn("Попытка поиска пустого тега.");
        return;
    }
    console.log(`Поиск по тегу: ${cleanTag}`);
    tagsInput.value = cleanTag;
    currentPage = 0;
    closeMediaView();
    searchPosts();
}

function addTagToSearch(tagToAdd) {
    if (!tagsInput) return;
    const cleanTagToAdd = tagToAdd.trim();
    if (!cleanTagToAdd) {
        console.warn("Попытка добавить пустой тег.");
        return;
    }

    const currentTags = tagsInput.value.trim().split(' ').filter(t => t.length > 0);

    if (!currentTags.includes(cleanTagToAdd)) {
        currentTags.push(cleanTagToAdd);
        tagsInput.value = currentTags.join(' ');
        currentPage = 0;
        closeMediaView();
        console.log(`Тег "${cleanTagToAdd}" добавлен. Новый поиск: ${tagsInput.value}`);
        searchPosts();
    } else {
         console.log(`Тег "${cleanTagToAdd}" уже присутствует в поиске.`);
         tagsInput.focus();
    }
}


// --- URL Handling ---

function updateURL(params = {}, forcePush = false) {
  try {
    const url = new URL(window.location);

    const managedKeys = ['tags', 'page', 'id', 's'];

    const targetUrl = new URL(window.location);
    managedKeys.forEach(key => targetUrl.searchParams.delete(key));
    Object.entries(params).forEach(([key, value]) => {
        if (managedKeys.includes(key) && value !== undefined && value !== null && value !== '') {
            targetUrl.searchParams.set(key, value);
        }
    });
    const newUrlString = targetUrl.toString();

    if (forcePush || newUrlString !== window.location.href) {
        history.pushState(
            params,
            '',
            newUrlString
        );
        console.log(`URL pushed: ${newUrlString}`);
    } else {
         console.log(`URL не изменился, pushState пропущен: ${newUrlString}`);
    }

  } catch (error) {
      console.error("Ошибка обновления URL:", error);
  }
}

function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    tags: params.get('tags') ? params.get('tags').replace(/\+/g, ' ') : '',
    page: Math.max(0, parseInt(params.get('page'), 10) || 0),
    postId: params.get('id') || null,
    s: params.get('s') || null
  };
}

async function handleInitialLoad() {
    console.log("Обработка начальной загрузки по URL...");
    const params = getURLParams();
    console.log("Параметры URL:", params);

    if (params.s || params.tags) {
        document.body.classList.add('show-interface');
        if (tagsInput) tagsInput.value = params.tags;
        currentPage = params.page;

        if (params.s === 'view' && params.postId) {
            console.log(`Попытка прямого открытия поста ID ${params.postId}`);
            const postToView = await fetchPostById(params.postId);
            if (postToView) {
                currentPosts = [postToView];
                await openMediaView(postToView);
                console.log("Медиа просмотр открыт по URL.");
                return;
            } else {
                console.warn(`Пост ID ${params.postId} из URL не найден. Отображение списка.`);
                updateURL({ s: 'list', id: undefined, tags: params.tags ? params.tags.replace(/ /g, '+') : undefined, page: params.page > 0 ? params.page : undefined });
                await searchPosts(params.tags);
            }
        } else {
            console.log("Загрузка списка постов по URL.");
            await searchPosts(params.tags);
        }
    } else {
        console.log("Параметры поиска/вида в URL не найдены. Отображение главной страницы.");
        document.body.classList.remove('show-interface');
    }
     updatePaginator();
}


// --- Event Listeners Setup ---

function setupEventListeners() {
    window.addEventListener('popstate', async (event) => {
        console.log("Событие Popstate:", event.state);
        await handleInitialLoad();
    });

    if (mediaView) {
        mediaView.addEventListener('click', function(e) {
            if (e.target === mediaView) {
                closeMediaView();
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mediaView && mediaView.classList.contains('active')) {
            closeMediaView();
        }
    });

    if (siteTitle) {
        siteTitle.addEventListener('click', goHome);
    }

    [mainSearchInput, tagsInput].forEach(input => {
        if (input) {
            input.addEventListener('awesomplete-selectcomplete', function() {
                console.log(`Выбрана подсказка Awesomplete для #${input.id}`);
            });
        }
    });

    console.log("Основные обработчики событий установлены.");
}
