
// Open the IndexedDB database
const request = indexedDB.open('zeke', 1);

// the main container for note list
const areaListNotes = document.getElementById('areaListNotes');

// Create object store and define its structure
request.onupgradeneeded = function(event) {
  const db = event.target.result;
  const objectStoreNote = db.createObjectStore('note', { keyPath: 'id', autoIncrement: true });
  objectStoreNote.createIndex('list','list', { unique: false });
  const objectStoreList = db.createObjectStore('list', { keyPath: 'id', autoIncrement: true });
};

// Handle successful database opening
request.onsuccess = async function(event) {
  const db = event.target.result;

  // Add a new todo
  function addNote(note) {
    const transaction = db.transaction(['note'], 'readwrite');
    const objectStore = transaction.objectStore('note');
    const request = objectStore.add(note);
    
    request.onsuccess = function(newNote) {
      console.log('Note added successfully');

      generateNoteItem(newNote.target.result, note.content, note.dateCreated, newNote.target.result - 1);

      let orderedNoteIds = JSON.parse(localStorage.getItem('noteOrder')) || {};
      if(orderedNoteIds && orderedNoteIds[note.list]) {
        orderedNoteIds[note.list].push(newNote.target.result);
      } else {
        orderedNoteIds[note.list] = [newNote.target.result];
      }
      
      localStorage.setItem('noteOrder', JSON.stringify(orderedNoteIds));
      console.log('List added successfully');

    };
    
    request.onerror = function() {
      console.error('Error adding note');
    };
  }

  function getNotes(listId = 0, orderDesc = true) {
    const transaction = db.transaction(['note'], 'readonly');
    const objectStore = transaction.objectStore('note');
    // const request = indexName ? objectStore.index(indexName) : objectStore.getAll();
    const request = objectStore.getAll();
    
    request.onsuccess = function(event) {
      const allNotes = event.target.result;
      let notes = [];

      if(listId) {
        notes = allNotes.filter(note =>note.list === parseInt(listId));
      } else {
        notes = allNotes;
      }
      if(orderDesc) {
        notes.sort((a, b) => b.id - a.id);
      }
      
      console.log('Note:', notes);

      document.querySelector('#areaListNotes ul').innerHTML = '';
      if(notes == undefined || notes.length == 0) {
        // areaListNotes.innerHTML = '';
      } else {
        const orderedNoteIds = JSON.parse(localStorage.getItem('noteOrder'));
        document.querySelector('#areaListNotes ul').innerHTML = '';
        if(orderedNoteIds && orderedNoteIds[listId]) {
          const orderedNotes = orderedNoteIds[listId].map(id =>notes.find(obj => obj.id === parseInt(id)));
          orderedNotes.forEach((item, idx) => {
            generateNoteItem(item.id, item.content, item.dateCreated, idx, true);
          });
        } else {
          notes.forEach((item, idx) => {
            generateNoteItem(item.id, item.content, item.dateCreated, idx);
          });
        }
        initDnD('areaListNotes', 'noteOrder');
        
      }
    };
    
    request.onerror = function() {
      console.error('Error getting notes');
    };
  }

  function updateNote(key, newValObj) {
    const transaction = db.transaction(['note'], 'readwrite');
    const objectStore = transaction.objectStore('note');
    const getRequest = objectStore.get(key);

    getRequest.onerror = () => {
      console.error('Failed to get the object from DB');
    }

    getRequest.onsuccess = () => {
      const data = getRequest.result;

      if(data) {
        const updatedData = { ...data, ...newValObj };
        const updateRequest = objectStore.put(updatedData);

        updateRequest.onerror = () => {
          console.error('Failed to update the value in DB');
        }
        updateRequest.onsuccess = () => {
          console.log('Note updated successfully');
        }
      } else {
        console.warn('Object not found in DB');
      }
    }
    
  }

  function deleteNote(id) {
    const transaction = db.transaction(['note'], 'readwrite');
    const objectStore = transaction.objectStore('note');
    const request = objectStore.delete(id);
    
    request.onsuccess = function() {
      console.log('Note deleted successfully');
    };
    
    request.onerror = function() {
      console.error('Error deleting note');
    };
  }

  function addList(list) {
    const transaction = db.transaction(['list'], 'readwrite');
    const objectStore = transaction.objectStore('list');
    const request = objectStore.add(list);
    
    request.onsuccess = function(newList) {
      generateListItem(newList.target.result, list.name, newList.target.result - 1);
      let currentOrder = localStorage.getItem('listOrder');
      currentOrder ? currentOrder = currentOrder.split(',') : currentOrder = [];
      currentOrder.push(newList.target.result);
      localStorage.setItem('listOrder', currentOrder);
      console.log('List added successfully');
    };
    
    request.onerror = function() {
      console.error('Error adding list');
    };
  }

  function getLists() {
    const transaction = db.transaction(['list'], 'readonly');
    const objectStore = transaction.objectStore('list');
    const request = objectStore.getAll();
    
    request.onsuccess = function(event) {
      const lists = event.target.result;
      console.log('Lists:', lists);
      
      if(lists == undefined || lists.length == 0) {
        addList({name:'Default'});
        localStorage.setItem('listActive', 1);
      } else {
        const orderedListIds = localStorage.getItem('listOrder');
        document.querySelector('#areaListLists ul').innerHTML = '';
        // if more than one list
        if(orderedListIds.includes(',')) {
          const currentOrderedIds = orderedListIds.split(',');
          const orderedLists = currentOrderedIds.map(id =>lists.find(obj => obj.id === parseInt(id)));
          orderedLists.forEach((item, idx) => {
            generateListItem(item.id, item.name, idx);
          });
        } else {
          lists.forEach((item, idx) => {
            generateListItem(item.id, item.name, idx);
          });
        }
        initDnD('areaListLists', 'listOrder');
      }
    };
    
    request.onerror = function() {
      console.error('Error getting lists');
    };
  }

  function updateList(id, val) {
    const transaction = db.transaction(['list'], 'readwrite');
    const objectStore = transaction.objectStore('list');
    const request = objectStore.put({id:id, name:val});
    
    request.onsuccess = function() {
      console.log('List updated successfully');
    };
    
    request.onerror = function() {
      console.error('Error updating list');
    };
  }

  function deleteList(id) {
    const transaction = db.transaction(['list'], 'readwrite');
    const objectStore = transaction.objectStore('list');
    const request = objectStore.delete(id);
    
    request.onsuccess = function() {
      console.log('List deleted successfully');
    };
    
    request.onerror = function() {
      console.error('Error deleting list');
    };
  }

  function addNewList() {
    const listName = document.getElementById('listAddName').value.trim();
    if(listName) {
      addList({name: listName});
    }
    document.getElementById('listAdd').classList.remove('active');
    document.getElementById('listAddName').value = '+';
    document.getElementById('listAddName').blur();
  }

  function generateListItem(id, name, order = 0) {
    let listItem = document.createElement('li');
    let listInput = document.createElement('input');
    let listRemove = document.createElement('span');
    listItem.draggable = true;
    listItem.dataset.id = id;
    listItem.dataset.index = order;
    listInput.dataset.id = id;
    listInput.value = name;
    listInput.readOnly = true;
    listRemove.dataset.id = id;
    listRemove.innerText = '-';
    listItem.append(listInput);
    listItem.append(listRemove);
    document.querySelector('#areaListLists ul').append(listItem);

    listInput.addEventListener('click', (e) => {
      const activedList = document.querySelector('#areaListLists input.active');
      if(activedList) {
        activedList.classList.remove('active');
      }
      e.target.classList.add('active');
      localStorage.setItem('listActive',e.target.dataset.id);
      getNotes(e.target.dataset.id);
      cleanModal();
    });

    listInput.addEventListener('dblclick', (e) => {
      listInput.readOnly = false;
      listItem.classList.add('edit');
    });

    listInput.addEventListener('blur', (e) => {
      let newVal = e.target.value.trim();
      let targetId = parseInt(e.target.dataset.id);
      if(newVal && newVal!=name) {
        updateList(targetId, newVal);
      }
      listInput.readOnly = true;
      setTimeout(()=>{
        listItem.classList.remove('edit');
      },100);
    }, true);

    listInput.addEventListener('keypress', (e) => {
      if (e.key == "Enter") {
        e.preventDefault();
        let newVal = e.target.value.trim();
        let targetId = parseInt(e.target.dataset.id);
        if(newVal && newVal!=name) {
          updateList(targetId, newVal);
        }
        listInput.readOnly = true;
        setTimeout(()=>{
          listItem.classList.remove('edit');
        },100);
      }
    });

    listRemove.addEventListener('click', (e) => {
      e.preventDefault();
      let targetId = parseInt(e.target.dataset.id);
      let elementSibling = listItem.previousElementSibling || listItem.nextElementSibling;
      if(elementSibling) {
        elementSibling.getElementsByTagName('input')[0].click();
        let currentOrder = localStorage.getItem('listOrder');
        let newOrder = [];
        currentOrder ? currentOrder = currentOrder.split(',') : currentOrder = [];
        for(let i = 0; i < currentOrder.length; i++) {
          if(currentOrder[i] != targetId) {
            newOrder.push(currentOrder[i]);
          }
        }
        localStorage.setItem('listOrder', newOrder);
        console.log(newOrder);
        listItem.remove();
        deleteList(id);
      }
    });

    if(localStorage.getItem('listActive') == id) {
      listInput.classList.add('active');
    }
  }

  function generateNoteItem(id, content, dateCreated, order = 0, byUserOrdered = false) {
    let noteItem = document.createElement('li');
    let noteCheckbox = document.createElement('input');
    let noteInput = document.createElement('input');
    let noteMoment = document.createElement('span');
    let noteRemove = document.createElement('span');
    noteItem.draggable = true;
    noteItem.dataset.id = id;
    noteItem.dataset.index = order;
    noteCheckbox.type = 'checkbox';
    noteInput.type = 'text';
    noteInput.value = content;
    noteInput.readOnly = true;
    noteMoment.className = 'noteMoment';
    noteMoment.innerText = convertTimetamp(dateCreated);
    noteRemove.className = 'noteRemove';
    noteRemove.innerText = '-';
    noteItem.append(noteCheckbox);
    noteItem.append(noteInput);
    noteItem.append(noteMoment);
    noteItem.append(noteRemove);
    if(byUserOrdered) {
      document.querySelector('#areaListNotes ul').append(noteItem);
    } else {
      document.querySelector('#areaListNotes ul').prepend(noteItem);
    }
    
    noteCheckbox.addEventListener('click', (e) => {
      const noteId = parseInt(e.target.parentNode.dataset.id);
      if(noteCheckbox.checked == true) {
        noteItem.classList.add('completed');
        updateNote(noteId, {completed: true, dateCompleted: Date.now()});
      } else {
        noteItem.classList.remove('completed');
        updateNote(noteId, {completed: false, dateCompleted: null});
      }
    });

    noteInput.addEventListener('dblclick', (e) => {
      noteInput.readOnly = false;
      noteItem.classList.add('edit');
    });

    noteInput.addEventListener('blur', (e) => {
      let newVal = e.target.value.trim();
      let targetId = parseInt(e.target.parentNode.dataset.id);
      if(newVal && newVal != content) {
        updateNote(targetId, {content: newVal});
      }
      noteInput.readOnly = true;
      setTimeout(()=>{
        noteItem.classList.remove('edit');
      },100);
    }, true);

    noteInput.addEventListener('keypress', (e) => {
      if (e.key == "Enter") {
        e.preventDefault();
        let newVal = e.target.value.trim();
        let targetId = parseInt(e.target.parentNode.dataset.id);
        if(newVal && newVal != content) {
          updateNote(targetId, {content: newVal});
        }
        noteInput.readOnly = true;
        setTimeout(()=>{
          noteItem.classList.remove('edit');
        },100);
      }
    });

    noteRemove.addEventListener('click', (e) => {
      e.preventDefault();
      const currentListId = parseInt(document.querySelector('#areaListLists li input.active').dataset.id);
      let targetId = parseInt(e.target.parentNode.dataset.id);
      let currentOrder = JSON.parse(localStorage.getItem('noteOrder')) || {};
      let newOrder = [];
      if(currentOrder && currentOrder[currentListId]) {
        for(let i = 0; i < currentOrder[currentListId].length; i++) {
          if(currentOrder[currentListId][i] != targetId) {
            newOrder.push(currentOrder[currentListId][i]);
          }
        }
        currentOrder[currentListId] = newOrder;
        localStorage.setItem('noteOrder', JSON.stringify(currentOrder));
      }
      
      console.log(newOrder);
      noteItem.remove();
      deleteNote(targetId);
    });

  }

  function cleanModal() {
    const modal = document.querySelector('.modal');
    const areaSettings = document.getElementById('areaSettings');
    const panelNote = document.getElementById('panelNote');
    const hiddenActivedList =  document.querySelector('#areaListLists input.hidden');
    areaSettings.classList.remove('active');
    panelNote.classList.remove('showModal');
    modal.classList.remove('open');
    if(hiddenActivedList) {
      hiddenActivedList.classList.remove('hidden');
    }
  }

  document.getElementById('btnNew').addEventListener('click', () => {
    const noteContent = document.getElementById('txtNew').value.trim();
    const listId = document.querySelector('#areaListLists li input.active').dataset.id;
    if(noteContent && listId) {
      addNote({
        list: parseInt(listId), 
        content: noteContent,
        completed: false,
        dateCreated: Date.now(),
        dateCompleted: '',
        parent: 0
      });
    }
    document.getElementById('txtNew').value = '';
  });
  document.getElementById('txtNew').addEventListener('keypress', (e) => {
    if (e.key == "Enter") {
      e.preventDefault();
      document.getElementById('btnNew').click();
    }
  });
  document.getElementById('listAddName').addEventListener('click', () => {
    document.getElementById('listAddName').classList.add('active');
    document.getElementById('listAddName').value = '';
  });
  document.getElementById('listAddName').addEventListener('keypress', (e) => {
    if (e.key == "Enter") {
      e.preventDefault();
      addNewList();
    }
  });
  document.getElementById('listAddName').addEventListener('blur', (e) => {
    document.getElementById('listAddName').classList.remove('active');
    document.getElementById('listAddName').value = '+';
  }, true);

  getLists();
  getNotes(
    parseInt(localStorage.getItem('listActive'))
  );

};

function initDnD(listName, storageName) {
  const list = document.querySelector(`#${listName} ul`);
  let draggedItem = null;

  list.addEventListener('dragstart', (e) => {
    draggedItem = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItem.dataset.index);
    e.target.classList.add('dragging');
  });

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetItem = e.target.closest('li');
    if(targetItem && targetItem != draggedItem) {
      const draggedIndex = parseInt(draggedItem.dataset.index);
      const targetIndex = parseInt(targetItem.dataset.index);
      if(draggedIndex < targetIndex) {
        list.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        list.insertBefore(draggedItem, targetItem);
      }
    }
  });

  list.addEventListener('dragend', (e) => {
    draggedItem = null;
    e.target.classList.remove('dragging');
    updateIndexes();
  });

  function updateIndexes() {
    const items = list.querySelectorAll('li');
    let newOrder = [];
    items.forEach((item, index) => {
      item.dataset.index = index;
      newOrder.push(item.dataset.id);
    });
    if(storageName == 'noteOrder') {
      /**
       * noteOrder: {listId: [noteId, ...noteId], ...}
       */
      let allNoteOrder = JSON.parse(localStorage.getItem('noteOrder')) || {};
      const currentListId = parseInt(document.querySelector('#areaListLists li input.active').dataset.id);
      allNoteOrder[currentListId] = newOrder;
      localStorage.setItem('noteOrder', JSON.stringify(allNoteOrder));
    } else {
      // list order
      localStorage.setItem(storageName, newOrder);
    }
  }
}

function initGrid() {

  const gutter = document.getElementById('gutter');
  const panelList = document.getElementById('panelList');
  const panelNote = document.getElementById('panelNote');
  const panelsContainer = document.getElementById('panelsContainer');

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  gutter.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseFloat(getComputedStyle(panelList).width);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const diffX = e.clientX - startX;
    let newWidth = parseInt(startWidth + diffX);
    const currentWidth = parseInt(getComputedStyle(panelsContainer).width.slice(0,-2));
    // 20px magnet
    if(newWidth < 20) {
      newWidth = 0;
    }
    if(newWidth > currentWidth / 2) {
      newWidth = currentWidth / 2;
    }
    panelsContainer.setAttribute('style',`grid-template-columns:${newWidth}px 10px 1fr;`);
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    localStorage.setItem('grid-template-columns', panelsContainer.style['grid-template-columns']);
  });

  if(localStorage.getItem('grid-template-columns')) {
    panelsContainer.style['grid-template-columns'] = localStorage.getItem('grid-template-columns');
  }

}

function initModal() {
  const modal = document.querySelector('.modal');
  const themes = document.querySelectorAll('.themeSelection');
  const modes = document.querySelectorAll('.modeSelection');
  const areaSettings = document.getElementById('areaSettings');
  const panelNote = document.getElementById('panelNote');
  const opacitySelection = document.getElementById('opacitySelection');
  const opacity = localStorage.getItem('opacity') || '100';
  
  document.getElementById('btnSettings').addEventListener('click', () => {
    const activedList = document.querySelector('#areaListLists input.active');
    areaSettings.classList.toggle('active');
    panelNote.classList.toggle('showModal');
    modal.classList.toggle('open');
    activedList.classList.toggle('hidden');
  });
  themes.forEach(theme => {
    theme.addEventListener('click', (e) => {
      document.body.className = e.target.dataset.id;
      localStorage.setItem('theme', e.target.dataset.id);
    });
  });
  modes.forEach(mode => {
    mode.addEventListener('click', (e) => {
      document.body.className = e.currentTarget.dataset.id;
      localStorage.setItem('theme', e.currentTarget.dataset.id);
    });
  });

  opacitySelection.value = opacity;
  opacitySelection.addEventListener('click', (e) => {
    document.body.style.opacity = e.target.value + '%';
    localStorage.setItem('opacity', e.target.value);
  });

  
}

function convertTimetamp(timestamp) {
  const seconds = Math.floor((new Date() - timestamp) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1
  };

  for (let interval in intervals) {
    const value = Math.floor(seconds / intervals[interval]);
    if (value >= 1) {
      return value + " " + interval + (value > 1 ? "s" : "") + " ago";
    }
  }

  return "Just now";
}

function init() {
  const theme = localStorage.getItem('theme') || '';
  const opacity = localStorage.getItem('opacity') || '100';
  document.body.className = theme;
  document.body.style.opacity = opacity+ '%';

  initGrid();
  initModal();
}

init();