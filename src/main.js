// const Sortable = require('./vendor/Sortable');

// Open the IndexedDB database
const request = indexedDB.open('neonote', 1);
var Zeke = {orderedNoteIds:{}, orderedPinNoteIds:{}};

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

  // Add a new note
  function addNote(note) {
    const transaction = db.transaction(['note'], 'readwrite');
    const objectStore = transaction.objectStore('note');
    const request = objectStore.add(note);
    
    request.onsuccess = function(newNote) {
      console.log('Note added successfully');

      if(note.parent > 0) {
        generateSubNoteItem({
          id: newNote.target.result,
          content: note.content, 
          dateCreated: note.dateCreated,
          parent: note.parent
        }, 'areaListNotes');
      } else {
        generateNoteItem({
          id: newNote.target.result,
          content: note.content, 
          dateCreated: note.dateCreated
        }, 'areaListNotes', newNote.target.result - 1);
      }

      updateSortIndexes('areaListNotes');
      
      console.log('Note added successfully');

    };
    
    request.onerror = function() {
      console.error('Error adding note');
    };
  }

  function renderNotes(listId = 0, orderDesc = true) {
    const transaction = db.transaction(['note'], 'readonly');
    const objectStore = transaction.objectStore('note');
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
      document.querySelector('#areaPinNotes ul').innerHTML = '';
      
      if(notes == undefined || notes.length == 0) {
        // areaListNotes.innerHTML = '';
      } else {
        let listNotes = notes;
        if(Zeke.orderedNoteIds[listId]) {
          listNotes = Zeke.orderedNoteIds[listId].map(id =>notes.find(obj => obj.id === parseInt(id)));
          if(listNotes.length != notes.length) {
            listNotes = notes;
          }
        }
        if(Zeke.orderedPinNoteIds[listId]) {
          const pinNotes = Zeke.orderedPinNoteIds[listId].map(id =>notes.find(obj => obj.id === parseInt(id)));
          if(pinNotes.length > 0 && pinNotes[0] != undefined) {
            // 1.1. render pinned parent notes
            pinNotes.forEach((item, idx) => {
              if(item && (item.parent == 0 || item.parent === true)) {
                generateNoteItem(item, 'areaPinNotes', idx, Zeke.orderedPinNoteIds[listId]);
                initDnD('areaPinNotes');
              }
            });
            // 1.2. render pinned subnotes
            pinNotes.forEach((item, idx) => {
              if(item && item.parent > 0 && item.parent !== true) {
                generateSubNoteItem(item, 'areaPinNotes', idx, Zeke.orderedPinNoteIds[listId]);
                initDnD('areaPinNotes', true);
    
                updateCompletionPercentage(item.parent);
              }
            });
          }
        }
        
        // 2.1 render parent note
        listNotes.forEach((item, idx) => {
          if(item && !item.pin && (item.parent == 0 || item.parent === true || item.parent == undefined)) {
            generateNoteItem(
              item,
              'areaListNotes',
              idx,
              Zeke.orderedNoteIds[listId] && Zeke.orderedNoteIds[listId].includes(item.id));
          }
          initDnD('areaListNotes');
          
        });

        // 2.2 fetch subtasks
        listNotes.forEach((item, idx) => {
          let expactedParentNote = notes.filter(note => note.id == item.parent);
          if(item && item.parent > 0 && item.parent !== true && expactedParentNote.length > 0) {
            generateSubNoteItem(item,
              'areaListNotes',
              idx,
              Zeke.orderedNoteIds[listId] && Zeke.orderedNoteIds[listId].includes(item.id));
            initDnD('areaListNotes', true);

            updateCompletionPercentage(item.parent);
          }
        });
      }

      // calculate usage
      const usage = (JSON.stringify(notes).length / 1024).toFixed(2);
      document.getElementById('db-usage').innerText = usage;
    };
    
    request.onerror = function() {
      console.error('Error getting notes');
    };
  }

  function dbUpdate(table, key, obj) {
    const transaction = db.transaction([table], 'readwrite');
    const objectStore = transaction.objectStore(table);
    const getRequest = objectStore.get(key);

    getRequest.onerror = () => {
      console.error('Failed to get the object from DB');
    }

    getRequest.onsuccess = () => {
      const data = getRequest.result;

      if(data) {
        const updatedData = { ...data, ...obj };
        const updateRequest = objectStore.put(updatedData);

        updateRequest.onerror = () => {
          console.error('Failed to update ' + table);
        }
        updateRequest.onsuccess = () => {
          console.log(table + ' updated successfully');
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

  function deleteNotesInList(listId) {
    const transaction = db.transaction(['note'], 'readonly');
    const objectStore = transaction.objectStore('note');
    const request = objectStore.getAll();
    request.onsuccess = function(event) {
      const allNotes = event.target.result;
      const notes = allNotes.filter(note =>note.list === parseInt(listId));
      notes.forEach(note => {
        deleteNote(note.id);
        console.log('Deleted note id ' + note.id + ' in list ' + listId);
      });
    }
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
      const brand = document.getElementById('brand');
      console.log('Lists:', lists);
      
      if(lists == undefined || lists.length == 0) {
        addList({name:'~'});
        brand.innerText = '~';
        localStorage.setItem('listActive', 1);
      } else {

        const orderedListIds = localStorage.getItem('listOrder');
        const rememberedActiveList = localStorage.getItem('listActive');

        lists.forEach(item => {
          Zeke.orderedNoteIds[item.id] = item.areaListNotes;
          Zeke.orderedPinNoteIds[item.id] = item.areaPinNotes;
        });

        document.querySelector('#areaListLists ul').innerHTML = '';
        // if more than one list
        if(orderedListIds && orderedListIds.includes(',')) {
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

        // show list name in brand title
        if(rememberedActiveList) {
          lists.forEach(item => {
            if(rememberedActiveList == item.id) {
              brand.innerText = item.name;
            }
          });
        }

        initDnD('areaListLists');
      }
    };
    
    request.onerror = function() {
      console.error('Error getting lists');
    };
  }

  function deleteList(id) {
    const transaction = db.transaction(['list'], 'readwrite');
    const objectStore = transaction.objectStore('list');
    const request = objectStore.delete(id);

    request.onsuccess = function() {
      deleteNotesInList(id);
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
    document.getElementById('listAddName').value = '';
    document.getElementById('listAddName').blur();
    document.getElementById('btnNewList').classList.remove('hide');
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
    listRemove.title = 'Remove';
    listRemove.className = 'icon listRemove';
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
      document.getElementById('brand').innerHTML = e.target.value;
      renderNotes(e.target.dataset.id);
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
        dbUpdate('list', targetId, {name: newVal});
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
          dbUpdate('list', targetId, {name: newVal});
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

  /**
   * Generate note item element <li>
   * @param {object} note {id:int, content:string, dateCreated:timestamp}
   * @param {string} area The area where the notes gones to: areaListLists|areaPinNotes|areaListNotes
   * @param {int} order 
   * @param {boolean} byUserOrdered
   */
  function generateNoteItem(note, area, order = 0, byUserOrdered = false) {
    let noteItem = document.createElement('li');
    let noteCheckbox = document.createElement('input');
    let noteInput = document.createElement('input');
    let noteMoment = document.createElement('span');
    let notePin = document.createElement('span');
    let noteRemove = document.createElement('span');
    let noteCollapse = document.createElement('span');
    let noteSub = document.createElement('span');
    let noteSubList = document.createElement('ul');
    noteItem.draggable = true;
    noteItem.dataset.id = note.id;
    noteItem.dataset.index = order;
    noteItem.className = note.completed ? "completed" : "";
    noteCheckbox.type = 'checkbox';
    noteCheckbox.checked = note.completed;
    noteInput.type = 'text';
    noteInput.className = 'noteContent';
    noteInput.value = note.content;
    noteInput.readOnly = true;
    noteMoment.className = 'noteMoment';
    noteMoment.innerText = convertTimetamp(note.dateCreated);
    noteCollapse.className = 'noteCollapse';
    noteSub.className = 'icon noteSub';
    noteSub.innerText = '+';
    noteSub.title = translate('__new_subtask__') || 'New Subtask';
    noteSub.dataset['langTitle'] = '__new_subtask__';
    noteSubList.className = 'noteSubList';
    notePin.innerText = '^';
    notePin.dataset['langTitle'] = note.pin ? '__unpin__' : '__pin__';
    notePin.title = translate(notePin.dataset['langTitle']) || note.pin ? 'Unpin' : 'Pin';
    notePin.className = 'icon notePin';
    noteRemove.className = 'icon noteRemove';
    noteRemove.innerText = '-';
    noteRemove.dataset['langTitle'] = '__remove__';
    noteRemove.title = translate('__remove__') || 'Remove';
    noteItem.append(noteCheckbox);
    noteItem.append(noteInput);
    noteItem.append(noteSub);
    noteItem.append(noteMoment);
    noteItem.append(noteRemove);
    noteItem.append(notePin);
    noteItem.append(noteCollapse);
    noteItem.append(noteSubList);

    if(note.parent > 0 || note.parent === true) {
      noteCollapse.classList.add('show');
    }

    if(byUserOrdered) {
      document.querySelector(`#${area} ul`).append(noteItem);
    } else {
      document.querySelector(`#${area} ul`).prepend(noteItem);
    }
    
    noteCheckbox.addEventListener('click', (e) => {
      const noteId = parseInt(e.target.parentNode.dataset.id);
      const subnotesList = document.querySelector(`li[data-id="${noteId}"] .noteSubList`);
      const subnotesIncomplete = subnotesList.querySelectorAll(`li:not(.completed)`);
      const subnotesCompleted = subnotesList.querySelectorAll(`li.completed`);
      if(noteCheckbox.checked == true) {
        noteItem.classList.add('completed');
        dbUpdate('note', noteId, {completed: true, dateCompleted: Date.now()});
        if(subnotesIncomplete.length > 0) {
          subnotesIncomplete.forEach((subnote) => {
            subnote.querySelector('input[type="checkbox"]').click();
          });
        }
      } else {
        noteItem.classList.remove('completed');
        dbUpdate('note', noteId, {completed: false, dateCompleted: null});
        if(subnotesCompleted.length > 0) {
          subnotesCompleted.forEach((subnote) => {
            subnote.querySelector('input[type="checkbox"]').click();
          });
        }
      }
    });

    noteInput.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // close any other opened edit item
      const editingNote = document.querySelector('li.edit');
      const editingNoteInput = document.querySelector('li.edit .noteContent');
      if(editingNote && e.target != editingNote) {
        closeEditingNote();
      } else {
        e.target.parentElement.classList.toggle('edit');
        e.target.readOnly = false;
        e.target.focus();
      }
      
    });

    noteInput.addEventListener('keypress', (e) => {
      if (e.key == "Enter") {
        e.preventDefault();
        let newVal = e.target.value.trim();
        let targetId = parseInt(e.target.parentNode.dataset.id);
        if(newVal && newVal != note.content) {
          dbUpdate('note', targetId, {content: newVal});
        }
        noteInput.readOnly = true;
        setTimeout(()=>{
          noteItem.classList.remove('edit');
        },100);
      }
    });

    noteSub.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      // if add subnote button is not clicked on current parent note
      if(e.target.parentElement.dataset.id != document.querySelector('#panelNote li.edit').dataset.id) {
        closeEditingNote();
      }

      let subNoteItem = document.createElement('li');
      let subNoteCheckbox = document.createElement('input');
      let subNoteInput = document.createElement('input');
      let subNoteRemove = document.createElement('span');

      subNoteItem.className = 'subNoteNew edit';
      subNoteCheckbox.type = 'checkbox';
      subNoteCheckbox.className = 'subNoteCheck';
      subNoteInput.type = 'text';
      subNoteInput.readOnly = false;
      subNoteInput.className = 'noteContent';
      subNoteRemove.className = 'noteRemove';

      subNoteInput.addEventListener('keypress', e => {
        if (e.key == "Enter") {
          e.preventDefault();
          e.stopPropagation();
          const noteContent = subNoteInput.value.trim();
          const currentListId = note.list || document.querySelector('#areaListLists input.active').dataset.id;
          if(noteContent && currentListId) {
            addNote({
              list: parseInt(currentListId), 
              parent: note.id,
              content: noteContent,
              completed: false,
              dateCreated: Date.now(),
              dateCompleted: ''
            });
            // update parent note to indicate it's a parent task
            dbUpdate('note', note.id, {
              parent: true
            });
            noteCollapse.classList.add('show');
            noteCollapse.classList.add('active');
            noteItem.classList.add('expand');
            subNoteItem.remove(); // remove origin after new subnote added
            updateCompletionPercentage(note.id);
          }
        }
      });

      subNoteItem.append(subNoteCheckbox);
      subNoteItem.append(subNoteInput);
      subNoteItem.append(subNoteRemove);
      noteSubList.prepend(subNoteItem);

      subNoteInput.focus();
    });

    notePin.addEventListener('click', (e) => {
      console.log('pin clicked');
      e.preventDefault();
      e.stopPropagation();

      if(note.pin) {
        document.querySelector('#areaListNotes ul').prepend(noteItem);
        note.title = 'Pin';
      } else {
        document.querySelector('#areaPinNotes ul').appendChild(noteItem);
        note.title = 'Unpin';
      }

      if(noteItem.classList.contains('edit')) {
        noteItem.classList.remove('edit');
      }

      note.pin = !note.pin;
      dbUpdate('note', note.id, {pin: note.pin});
      updateSortIndexes('areaListNotes');
      updateSortIndexes('areaPinNotes');
    });

    noteRemove.addEventListener('click', (e) => {
      e.preventDefault();

      let targetId = parseInt(e.target.parentNode.dataset.id);

      noteItem.remove();
      updateSortIndexes(area);
      deleteNote(targetId);
    });

    noteCollapse.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if(noteCollapse.classList.contains('show')) {
        setTimeout(()=>{
          noteCollapse.classList.toggle('active');
          noteItem.classList.toggle('expand');
        },100);
        noteItem.classList.remove('edit');
        noteInput.readOnly = true;
        noteInput.blur();
      }
    });

  }

  /**
   * Generate subnote list<li>
   */
  function generateSubNoteItem(subNote, area, order = 0, byUserOrdered = false) {

    let containerArea = document.querySelector(`#${area} li[data-id='${subNote.parent}'] ul`);
    if(!containerArea) {
      return;
    }

    let subNoteItem = document.createElement('li');
    let subNoteCheckbox = document.createElement('input');
    let subNoteInput = document.createElement('input');
    let subNoteMoment = document.createElement('span');
    let subNoteRemove = document.createElement('span');
    subNoteItem.draggable = true;
    subNoteItem.dataset.id = subNote.id;
    subNoteItem.dataset.index = order;
    subNoteItem.className = subNote.completed ? "completed" : "";
    subNoteCheckbox.type = 'checkbox';
    subNoteCheckbox.checked = subNote.completed;
    subNoteInput.type = 'text';
    subNoteInput.className = 'noteContent';
    subNoteInput.value = subNote.content;
    subNoteInput.readOnly = true;
    subNoteMoment.className = 'noteMoment';
    subNoteMoment.innerText = convertTimetamp(subNote.dateCreated);
    subNoteRemove.className = 'icon noteRemove';
    subNoteRemove.innerText = '-';
    subNoteRemove.dataset['langTitle'] = '__remove__';
    subNoteRemove.title = translate('__remove__') || 'Remove';

    subNoteItem.append(subNoteCheckbox);
    subNoteItem.append(subNoteInput);
    subNoteItem.append(subNoteMoment);
    subNoteItem.append(subNoteRemove);

    if(byUserOrdered) {
      containerArea.append(subNoteItem);
    } else {
      containerArea.prepend(subNoteItem);
    }

    document.querySelector(`#${area} li[data-id='${subNote.parent}']`).classList.add('parent');
    
    subNoteCheckbox.addEventListener('click', (e) => {
      const subNoteId = parseInt(e.target.parentNode.dataset.id);
      if(subNoteCheckbox.checked == true) {
        subNoteItem.classList.add('completed');
        dbUpdate('note', subNoteId, {completed: true, dateCompleted: Date.now()});
      } else {
        subNoteItem.classList.remove('completed');
        dbUpdate('note', subNoteId, {completed: false, dateCompleted: null});
      }
      updateCompletionPercentage(subNote.parent);
    });

    subNoteInput.addEventListener('keypress', (e) => {
      if (e.key == "Enter") {
        e.preventDefault();
        let newVal = e.target.value.trim();
        let targetId = parseInt(e.target.parentNode.dataset.id);
        if(newVal && newVal != subNote.content) {
          dbUpdate('note', targetId, {content: newVal});
        }
        subNoteInput.readOnly = true;
        setTimeout(()=>{
          subNoteItem.classList.remove('edit');
        },100);
      }
    });

    subNoteRemove.addEventListener('click', (e) => {
      e.preventDefault();
      let targetId = parseInt(e.target.parentNode.dataset.id);

      subNoteItem.remove();
      updateSortIndexes(area);
      deleteNote(targetId);
    });

    subNoteItem.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // close any other opened edit item
      const editingNote = document.querySelector('li.edit');
      if(editingNote && e.target != editingNote) {
        closeEditingNote();
      } else {
        e.target.parentElement.classList.toggle('edit');
        e.target.readOnly = false;
        e.target.focus();
      }
      
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

  function initDnD(listName, noteSubList = false) {
    const list = document.querySelectorAll(`#${listName} ul${noteSubList?' ul':''}`);
    list.forEach((li, idx) => {
      Sortable.create(li, {
        group: listName,
        animation: 150,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        invertSwap: true,
        direction: 'vertical',
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        fallbackClass: "sortable-fallback",
        dragClass: "sortable-drag",
        filter: "li.edit input.noteContent",
        preventOnFilter: false,
        onMove: function (evt) {
          if(evt.dragged.querySelectorAll('.noteSubList li').length > 0 &&
            evt.related.parentElement.classList.contains('noteSubList')){
            return false;
          }
        },
        onEnd: function (evt) {
          let currentListId = parseInt(document.querySelector('#areaListLists input.active').dataset.id);
          let sourceTaskId = parseInt(evt.item.dataset.id);
          let sourceParentTaskId = parseInt(evt.from.parentElement.dataset.id);
          let targetTaskId = parseInt(evt.to.parentElement.dataset.id);
          // if subnote to parent note
          if(evt.from.classList.contains('noteSubList') && !evt.to.classList.contains('noteSubList')) {
            if(evt.from.childElementCount == 0) {
              // update leaving ex-parent, if the dragged task is the last subtask of the previous parent task, set the ex-parent task as a normal task
              dbUpdate('note', sourceParentTaskId, { parent: 0 });
            }
            dbUpdate('note', sourceTaskId, { parent: 0 });
          };
          // if parent note to subnote
          if(evt.item.querySelector('span.noteSub') && 
            evt.to.classList.contains('noteSubList')) {
              // update dragged task to set its parent id that becomes to a subtask
              dbUpdate('note', sourceTaskId, { parent: targetTaskId });
              // update target task to set it becomes to a parent task
              dbUpdate('note', targetTaskId, { parent: true });
          };
          // if subnote to subnote
          if(evt.from.classList.contains('noteSubList') && evt.to.classList.contains('noteSubList')) {
            // if ex-parent has no subtask
            if(evt.from.childElementCount == 0) {
              dbUpdate('note', sourceParentTaskId, { parent: 0 });
            }
            dbUpdate('note', targetTaskId, { parent: true });
            dbUpdate('note', sourceTaskId, { parent: targetTaskId });
          };
          
          updateSortIndexes(listName);
          renderNotes(currentListId);
        }
      });
    });
  }

  function updateSortIndexes(areaListName) {
    const items = document.querySelectorAll(`#${areaListName} ul li`);
    let areaListNameMap = {"areaListNotes":"orderedNoteIds", "areaPinNotes":"orderedPinNoteIds"};
    let currentListId = parseInt(document.querySelector('#areaListLists input.active').dataset.id);
    let newOrder = [];
    items.forEach(item => {
      // item.dataset.index = index;
      newOrder.push(parseInt(item.dataset.id));
    });
    Zeke[areaListNameMap[areaListName]][currentListId] = newOrder;
    dbUpdate('list', currentListId, {[areaListName] : newOrder});
  }

  function updateCompletionPercentage(parentId) {
    const parentNote = document.querySelector(`#panelNote li[data-id="${parentId}"]`);
    const parentCompletionButton = parentNote.querySelector(`input[type="checkbox"]`);
    const subnoteCompletedCount = parentNote.querySelectorAll('.noteSubList li.completed').length;
    const subnoteTotalCount = parentNote.querySelectorAll('.noteSubList li').length;
    const completionPercentage = (subnoteCompletedCount / subnoteTotalCount * 100).toFixed();

    if(completionPercentage == 100) {
      parentCompletionButton.style = '';
      if(!parentNote.classList.contains('completed')) {
        parentCompletionButton.click();
      }
    } else {
      if(parentNote.classList.contains('completed')) {
        parentNote.classList.remove('completed');
        parentCompletionButton.checked = false;
      }
      const currentThemeStrokeColor = getCurrentThemeColor(true);
      const fillColor = currentThemeStrokeColor ? currentThemeStrokeColor + '66' : '#cccccccc';
      parentCompletionButton.style.backgroundImage = `conic-gradient(transparent ${completionPercentage}%, ${fillColor} 0)`;
    }
  }

  function filterNote() {
    let filterText = document.getElementById('txtNew').value;
    let queryToHiding = '';

    const filterCompleted = document.getElementById('filterCompleted');
    const filterIncompleted = document.getElementById('filterIncompleted');

    if(filterCompleted.className === 'active') {
      queryToHiding = '.completed';
    }
    if(filterIncompleted.className === 'active') {
      queryToHiding = ':not(.completed)';
    }

    const allNotes = document.querySelectorAll('#panelNote li' + queryToHiding);

    allNotes.forEach(note => {
      let noteContent = note.querySelector('input.noteContent').value;
      if(!noteContent.includes(filterText)) {
        note.classList.add('hide');
      } else {
        note.classList.remove('hide');
      }
    });
  }

  function filterCompletion(filterButtonId) {
    const filterButton = document.getElementById(filterButtonId);
    const hiddenNotes = document.querySelectorAll('#panelNote li.hide');
    let queryToHiding = '.completed';

    if(filterButtonId === 'filterCompleted') {
      queryToHiding = ':not(.completed)';
    }

    hiddenNotes.forEach(note => {
      note.classList.remove('hide');
    });

    if(filterButton.className === 'active') {
      filterButton.className = '';
    } else {
      const hiddenNotes = document.querySelectorAll('#panelNote li' + queryToHiding);
      hiddenNotes.forEach(note => {
        note.classList.add('hide');
      });
      filterButton.className = 'active';
    }

    filterNote();
  }

  document.getElementById('btnFilter').addEventListener('click', (e) => {
    const btnFilter = document.getElementById('btnFilter');
    const btnNew = document.getElementById('btnNew');
    const txtNew = document.getElementById('txtNew');
    const filterbar = document.getElementById('filterbar');
    const filterCompleted = document.getElementById('filterCompleted');
    const filterIncompleted = document.getElementById('filterIncompleted');

    filterCompleted.className = '';
    filterIncompleted.className = '';

    if(btnFilter.className === 'active') {
      const allHiddenNotes = document.querySelectorAll('#panelNote li.hide');
      allHiddenNotes.forEach(note => {
        note.classList.remove('hide');
      });
      filterbar.className = '';
      btnFilter.className = '';
      btnNew.className = '';
      txtNew.value = '';
    } else {
      filterbar.className = 'active';
      btnFilter.className = 'active';
      btnNew.className = 'hide';
      txtNew.focus();
      if(txtNew.value !== '') {
        filterNote();
      }
    }
  });
  document.getElementById('filterIncompleted').addEventListener('click', () => {
    const filterCompleted = document.getElementById('filterCompleted');
    filterCompleted.className = '';
    filterCompletion('filterIncompleted');
  });
  document.getElementById('filterCompleted').addEventListener('click', () => {
    const filterIncompleted = document.getElementById('filterIncompleted');
    filterIncompleted.className = '';
    filterCompletion('filterCompleted');
  });
  document.getElementById('btnNew').addEventListener('click', () => {
    const noteContent = document.getElementById('txtNew').value.trim();
    const listId = document.querySelector('#areaListLists li input.active').dataset.id;
    if(noteContent && listId && document.getElementById('btnFilter').className === '') {
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
    if (e.key == "Enter" && document.getElementById('btnFilter').className !== 'active') {
      e.preventDefault();
      document.getElementById('btnNew').click();
    }
  });
  document.getElementById('txtNew').addEventListener('input', (e) => {
    e.preventDefault();
    if(document.getElementById('btnFilter').className === 'active') {
      filterNote();
    }
  });
  document.getElementById('txtNew').addEventListener('focus', (e) => {
    const btnFilter = document.getElementById('btnFilter');
    const areaNew = document.getElementById('areaNew');
    if(btnFilter.className !== 'active' && btnFilter.className !== 'hide') {
      areaNew.style.gridTemplateColumns = '0 1fr 30px';
      btnFilter.style.display = 'none';
    }
  });
  document.getElementById('txtNew').addEventListener('focusout', (e) => {
    const btnFilter = document.getElementById('btnFilter');
    const areaNew = document.getElementById('areaNew');
    if(btnFilter.className !== 'active') {
      btnFilter.className = '';
      areaNew.style.gridTemplateColumns = 'auto 1fr 30px';
      btnFilter.style = '';
    }
  });
  document.getElementById('btnNewList').addEventListener('click', () => {
    document.getElementById('btnNewList').classList.add('hide');
    document.getElementById('listAddName').classList.add('active');
    document.getElementById('listAddName').value = '';
    document.getElementById('listAddName').focus();
  });
  document.getElementById('listAddName').addEventListener('keypress', (e) => {
    if (e.key == "Enter") {
      e.preventDefault();
      addNewList();
    }
  });
  document.getElementById('listAddName').addEventListener('blur', (e) => {
    document.getElementById('btnNewList').classList.remove('hide');
    document.getElementById('listAddName').classList.remove('active');
    document.getElementById('listAddName').value = '';
  }, true);
  document.getElementById('panelsContainer').addEventListener('click', (e) => {
    if(e.target.readOnly || e.target.nodeName !== 'INPUT') {
      closeEditingNote();
    }
  });

  getLists();
  renderNotes(
    parseInt(localStorage.getItem('listActive'))
  );

};

function initGrid() {

  const gutter = document.getElementById('gutter');
  const panelList = document.getElementById('panelList');
  const panelsContainer = document.getElementById('panelsContainer');
  const gridTemplateColumns = localStorage.getItem('grid-template-columns') || '100px 10px 1fr';
  const listOpened = JSON.parse(localStorage.getItem('listOpened'));

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  panelsContainer.classList.add('toggling');

  gutter.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseFloat(getComputedStyle(panelList).width);
    panelsContainer.classList.remove('toggling');
  });

  gutter.addEventListener('mousemove', (e) => {
    if (isResizing) {
      const diffX = e.clientX - startX;
      let widthList = parseInt(startWidth + diffX);
      let widthGutter = 10;
      const currentWidth = parseInt(getComputedStyle(panelsContainer).width.slice(0,-2));
      // 60px magnet
      if(widthList < 60) {
        widthList = widthGutter = 0;
      }
      if(widthList > currentWidth / 2) {
        widthList = currentWidth / 2;
      }
      panelsContainer.setAttribute('style',`grid-template-columns:${widthList}px ${widthGutter}px 1fr;`);
    };
  });

  gutter.addEventListener('mouseup', () => {
    isResizing = false;
    localStorage.setItem('grid-template-columns', panelsContainer.style['grid-template-columns']);
    panelsContainer.classList.remove('resizing');
    panelsContainer.classList.add('toggling');
  });

  panelsContainer.addEventListener('mouseup', () => {
    isResizing = false;
  });

  panelsContainer.style.gridTemplateColumns = listOpened ? gridTemplateColumns : '0px 0px 1fr';

}

function initModal() {
  const modal = document.querySelector('.modal');
  const themes = document.querySelectorAll('.themeSelection');
  const modes = document.querySelectorAll('.modeSelection');
  const areaSettings = document.getElementById('areaSettings');
  const panelNote = document.getElementById('panelNote');
  const opacitySelection = document.getElementById('opacitySelection');
  const languageList = document.getElementById('languageList');
  const restore = document.getElementById('restore');
  const clear = document.getElementById('clear');
  const opacity = localStorage.getItem('opacity') || '100';
  const rememberedLanguage = localStorage.getItem('language') || 'en';

  document.getElementById('btnSettings').addEventListener('click', () => {
    const activedList = document.querySelector('#areaListLists input.active');
    areaSettings.classList.toggle('active');
    panelNote.classList.toggle('showModal');
    modal.classList.toggle('open');
    activedList.classList.toggle('hidden');
    if(!modal.classList.contains('open')) {
      activedList.click();
    }
  });

  languageList.addEventListener('change', e => {
    changeLanguage(e.target.value);
    localStorage.setItem('language', e.target.value);
  });

  languageList.value = rememberedLanguage;

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

  restore.addEventListener('click', (e) => {
    localStorage.removeItem('noteOrder');
    localStorage.removeItem('pinNoteOrder');
    localStorage.removeItem('listOrder');
    localStorage.removeItem('theme');
    localStorage.removeItem('opacity');
    localStorage.removeItem('bounds');
    localStorage.removeItem('listActive');
    localStorage.removeItem('language');
    localStorage.removeItem('grid-template-columns');
    localStorage.removeItem('listOpened');
    localStorage.removeItem('alwaysOnTop');
  });

  clear.addEventListener('click', (e) => {
    restore.click();
    window.indexedDB.deleteDatabase('neonote');
    location.reload();
  });
  
}

function initTitlebar() {
  const btnSidebar= document.querySelector('.appSidebar');
  const btnAlwaysOnTop = document.querySelector('.appAlwaysOnTop');
  const btnMinimize = document.querySelector('.appMinimize');
  const btnQuit= document.querySelector('.appQuit');

  // init always on top
  if(localStorage.getItem('alwaysOnTop') === 'true') {
    window.electronAPI.setAlwaysOnTop(true);
    btnAlwaysOnTop.classList.add('active');
  };
  
  btnAlwaysOnTop.addEventListener('click', (e) => {
    const isAlwaysOnTop = btnAlwaysOnTop.classList.contains('active');
    window.electronAPI.setAlwaysOnTop(!isAlwaysOnTop);
    btnAlwaysOnTop.classList.toggle('active');
    localStorage.setItem('alwaysOnTop', !isAlwaysOnTop);
  });

  btnMinimize.addEventListener('click', (e) => {
    window.electronAPI.minimize();
  });

  btnQuit.addEventListener('click', async () => {
    const bounds = await window.electronAPI.getBounds();
    localStorage.setItem('bounds', JSON.stringify(bounds));
    window.electronAPI.close();
  });

  btnSidebar.addEventListener('click', (e) => {
    let panelsContainer = document.getElementById('panelsContainer');
    const currentGrid = panelsContainer.style.gridTemplateColumns;
    const rememberedGrid = localStorage.getItem('grid-template-columns') || '100px 10px 1fr';

    if(currentGrid == '0px 0px 1fr') {
      panelsContainer.style.gridTemplateColumns = rememberedGrid;
      localStorage.setItem('listOpened', true);
    } else {
      panelsContainer.style.gridTemplateColumns = '0px 0px 1fr';
      localStorage.setItem('grid-template-columns', rememberedGrid); // remember previouse size
      localStorage.setItem('listOpened', false);
    }
  });
}

function initLanguage() {
  const rememberedLanguage = localStorage.getItem('language') || 'en';
  // await fetch('./lang.json').then(res => res.json()).then(json => {
  //   languages = json;
  //   changeLanguage(rememberedLanguage);
  // });
  // languages = Language;
  if(rememberedLanguage === 'ar' || rememberedLanguage === 'pk') {
    document.body.classList.add('ar');
  }
  changeLanguage(rememberedLanguage);
}

function convertTimetamp(timestamp) {
  const seconds = Math.floor((new Date() - timestamp) / 1000);
  const language = localStorage.getItem('language') || 'en';

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hr: 3600,
    min: 60,
    sec: 1
  };

  for (let interval in intervals) {
    const value = Math.floor(seconds / intervals[interval]);
    if (value >= 1) {
      return value + " " + (translate(`__${interval}__`) || interval) + (value > 1 && language === 'en' ? "s ago" : "");
    }
  }

  return language === 'en' ? "Just now" : translate(`__just_now__`) || "Just now";
}

function closeEditingNote() {
  const editingNote = document.querySelector('#panelNote li.edit');
  const editingNoteInput = document.querySelector('#panelNote li.edit .noteContent');
  if(editingNote) {
    if(editingNote.classList.contains('subNoteNew') && editingNoteInput.value.trim() == '') {
      editingNote.remove();
    } else {
      editingNote.classList.remove('edit');
      editingNoteInput.readOnly = true;
      editingNoteInput.blur();
    }
  }
}

function getCurrentThemeColor(stock = false) {
  const stockColor = stock ? '-stroke' : '';
  const currentTheme = document.body.className.substring(6);
  const style = window.getComputedStyle(document.body);
  const cssVariableValue = style.getPropertyValue('--' + currentTheme + stockColor).trim();

  return cssVariableValue;
}

function changeLanguage(languageCode) {
  const elementsInnerText = document.querySelectorAll('[data-lang-innertext]');
  const elementsTitle = document.querySelectorAll('[data-lang-title]');

  if(languageCode === 'ar' || languageCode === 'pk') {
    document.body.classList.add('ar');
  }
  if(languageCode !== 'ar' && languageCode !== 'pk' && document.body.classList.contains('ar')) {
    document.body.classList.remove('ar');
  }
  
  elementsInnerText.forEach(el => {
    el.innerText = Languages[languageCode][el.dataset['langInnertext']] || el.innerText;
  });
  elementsTitle.forEach(el => {
    el.title = Languages[languageCode][el.dataset['langTitle']] || el.title;
  });
}

function translate(wordsCode) {
  const currentLanguage = localStorage.getItem('language') || 'en';
  return Languages[currentLanguage][wordsCode] || false;
}

function init() {
  const theme = localStorage.getItem('theme') || '';
  const opacity = localStorage.getItem('opacity') || '100';
  const bounds = localStorage.getItem('bounds');

  document.body.className = theme;
  document.body.style.opacity = opacity + '%';

  if(!getCurrentThemeColor()) {
    document.body.className = 'origin-theme-light';
  }

  if(bounds) {
    window.electronAPI.setBounds(JSON.parse(bounds));
  }

  initTitlebar();
  initGrid();
  initModal();
  initLanguage();
}

init();