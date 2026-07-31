// const Sortable = require('./vendor/Sortable');

// Open the IndexedDB database
const request = indexedDB.open('neonote', 1);
var Zeke = {
  orderedNoteIds:{}, orderedPinNoteIds:{}, 
  notesCompleted:{}, notesIncompleted:{}, 
  notes:{}, lists:{},
  expandedNotesIds: new Set()
};
var Zeke_ChartTimeline;
var sortableInstances = [];
var neonoteDb = null;

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
  neonoteDb = db;

  // Add a new note
  function addNote(note) {
    const transaction = db.transaction(['note'], 'readwrite');
    const objectStore = transaction.objectStore('note');
    const request = objectStore.add(note);
    
    request.onsuccess = function(newNote) {
      console.log('Note added successfully');

      // Preserve expanded state before re-render
      document.querySelectorAll('#panelNote li.expand').forEach(li => {
        Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
      });
      renderNotes(parseInt(localStorage.getItem('listActive')));

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

      Zeke.notes = allNotes;

      if(listId) {
        notes = allNotes.filter(note => note.list === parseInt(listId));
        Zeke.notesCompleted[listId] = notes.filter(note => note.completed == true);
        Zeke.notesIncompleted[listId] = notes.filter(note => note.completed == false);
      } else {
        notes = allNotes;
      }
      if(orderDesc) {
        notes.sort((a, b) => b.id - a.id);
      }
      
      document.querySelector('#areaListNotes ul').innerHTML = '';
      document.querySelector('#areaPinNotes ul').innerHTML = '';
      
      if(notes == undefined || notes.length == 0) {
        // areaListNotes.innerHTML = '';
      } else {
        let listNotes = notes;
        if(Zeke.orderedNoteIds[listId]) {
          const savedOrder = Zeke.orderedNoteIds[listId];
          const savedIdSet = new Set(savedOrder.map(id => parseInt(id)));
          // Map saved order to note objects, filtering out deleted/stale entries
          const orderedNotes = savedOrder
            .map(id => notes.find(obj => obj.id === parseInt(id)))
            .filter(Boolean);
          // Notes not in saved order (newly added, just unpinned, pinned in other area)
          const unorderedNotes = notes.filter(n => !savedIdSet.has(n.id));
          if (orderedNotes.length > 0) {
            listNotes = [...unorderedNotes, ...orderedNotes];
          }
        }
        if(Zeke.orderedPinNoteIds[listId]) {
          const pinNotes = Zeke.orderedPinNoteIds[listId]
            .map(id => notes.find(obj => obj.id === parseInt(id)))
            .filter(Boolean);
          if(pinNotes.length > 0) {
            // 1.1. render pinned parent notes
            pinNotes.forEach((item, idx) => {
              if(item && (item.parent == 0 || item.parent === true)) {
                generateNoteItem(item, 'areaPinNotes', idx, Zeke.orderedPinNoteIds[listId]);
              }
            });
            // 1.2. render pinned subnotes
            pinNotes.forEach((item, idx) => {
              if(item && item.parent > 0 && item.parent !== true) {
                generateSubNoteItem(item, 'areaPinNotes', idx, Zeke.orderedPinNoteIds[listId]);
                updateCompletionPercentage(item.parent);
              }
            });
            // 1.3. render subnotes of pinned parents not yet tracked in orderedPinNoteIds
            const pinnedParentIds = pinNotes
              .filter(item => item && (item.parent == 0 || item.parent === true))
              .map(item => item.id);
            const pinNoteIdSet = new Set(Zeke.orderedPinNoteIds[listId].map(id => parseInt(id)));
            notes.forEach((item) => {
              if (item && item.parent > 0 && item.parent !== true
                && pinnedParentIds.includes(item.parent)
                && !pinNoteIdSet.has(item.id)) {
                  generateSubNoteItem(item, 'areaPinNotes', 0, false);
                  updateCompletionPercentage(item.parent);
                }
            });
            initNoteDnD('areaPinNotes');
            updateSortIndexes('areaPinNotes');
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
        });

        // 2.2 fetch subtasks
        const pinnedIds = Zeke.orderedPinNoteIds[listId] ? new Set(Zeke.orderedPinNoteIds[listId].map(id => parseInt(id))) : new Set();
        listNotes.forEach((item, idx) => {
          let expactedParentNote = notes.filter(note => note.id == item.parent);
          if(item && item.parent > 0 && item.parent !== true && expactedParentNote.length > 0 && !pinnedIds.has(item.parent)) {
            generateSubNoteItem(item,
              'areaListNotes',
              idx,
              Zeke.orderedNoteIds[listId] && Zeke.orderedNoteIds[listId].includes(item.id));
            updateCompletionPercentage(item.parent);
          }
        });

        initNoteDnD('areaListNotes');
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

        initListDnD();
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
    let noteDueDate = document.createElement('span');
    let noteReminder = document.createElement('span');
    let noteMoment = document.createElement('span');
    let notePin = document.createElement('span');
    let noteRemove = document.createElement('span');
    let noteCollapse = document.createElement('div');
    let noteSub = document.createElement('span');
    let noteSubList = document.createElement('ul');
    noteItem.draggable = true;
    noteItem.dataset.id = note.id;
    noteItem.dataset.index = order;
    noteItem.className = updateCompletionStyle(note.due, note.dateCompleted);
    noteCheckbox.type = 'checkbox';
    noteCheckbox.checked = note.completed;
    noteInput.type = 'text';
    noteInput.className = 'noteContent';
    noteInput.value = note.content;
    noteInput.readOnly = true;
    noteDueDate.className = note.due ? 'noteDueDate active' : 'noteDueDate';
    noteDueDate.title = note.due ? translate('__due_at__') + ' ' + moment(note.due).format('YYYY-MM-DD') : 
    '';
    noteDueDate.innerHTML = note.due ? checkDueDateStatus(noteDueDate, note.due, note.dateCompleted) : iconDueDate;
    noteReminder.className = note.remind ? 'noteReminder active' : 'noteReminder';
    noteReminder.title = note.remind ? translate('__remind_me_at__') + ' ' + moment(note.remind).format('YYYY-MM-DD HH:MM') : '';
    noteReminder.innerHTML = note.remind ? iconReminderActive : iconReminder;
    noteMoment.className = 'noteMoment';
    noteMoment.innerText = moment(note.dateCreated).fromNow();
    noteMoment.title = moment(note.dateCreated).format('YYYY-MM-DD HH:MM');
    noteCollapse.className = 'noteCollapse';
    noteCollapse.innerHTML = '<span class="iconCollapse"></span>';
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
    noteItem.append(noteDueDate);
    noteItem.append(noteReminder);
    noteItem.append(noteSub);
    noteItem.append(noteMoment);
    noteItem.append(noteRemove);
    noteItem.append(notePin);
    noteItem.append(noteCollapse);
    noteItem.append(noteSubList);

    if(note.parent > 0 || note.parent === true) {
      // Verify actual subnotes exist; fix stale parent:true in DB if none remain
      const hasSubnotes = Zeke.notes.some(n => n.parent === note.id);
      if (hasSubnotes) {
        noteCollapse.classList.add('show');
        if(Zeke.expandedNotesIds.has(note.id)) {
          noteCollapse.classList.add('active');
          noteItem.classList.add('expand');
        }
      } else {
        note.parent = 0;
        dbUpdate('note', note.id, { parent: 0 });
      }
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
          note.content = newVal;
        }
        noteInput.readOnly = true;
        setTimeout(()=>{
          noteItem.classList.remove('edit');
        },100);
      }
    });

    noteInput.addEventListener('focusout', (e) => {
      if (!noteInput.readOnly) {
        let newVal = noteInput.value.trim();
        let targetId = parseInt(noteItem.dataset.id);
        if (newVal && newVal != note.content) {
          dbUpdate('note', targetId, {content: newVal});
          note.content = newVal;
        }
        noteInput.readOnly = true;
        noteItem.classList.remove('edit');
      }
    });

    noteSub.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      // if add subnote button is not clicked on current parent note
      const editLi = document.querySelector('#panelNote li.edit');
      if(editLi && e.target.parentElement.dataset.id != editLi.dataset.id) {
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

      subNoteInput.addEventListener('focusout', e => {
        if (!subNoteItem.isConnected) return;
        const noteContent = subNoteInput.value.trim();
        const currentListId = note.list || document.querySelector('#areaListLists input.active')?.dataset.id;
        if (noteContent && currentListId) {
          addNote({
            list: parseInt(currentListId),
            parent: note.id,
            content: noteContent,
            completed: false,
            dateCreated: Date.now(),
            dateCompleted: ''
          });
          dbUpdate('note', note.id, { parent: true });
          noteCollapse.classList.add('show');
          noteCollapse.classList.add('active');
          noteItem.classList.add('expand');
          subNoteItem.remove();
          updateCompletionPercentage(note.id);
        } else {
          subNoteItem.remove();
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
          if (noteItem.classList.contains('expand')) {
            Zeke.expandedNotesIds.add(note.id);
          } else {
            Zeke.expandedNotesIds.delete(note.id);
          }
        }, 100);
        noteItem.classList.remove('edit');
        noteInput.readOnly = true;
        noteInput.blur();
      }
    });

    noteReminder.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (reminderPicker.isOpen()) {
        reminderPicker.close();
        return;
      }

      reminderPicker.onClose = null;
      reminderPicker.show(noteReminder, note.remind, (dateTime) => {
        const remindTimestamp = new Date(dateTime).getTime();
        dbUpdate('note', note.id, { remind: remindTimestamp });
        note.remind = remindTimestamp;
        noteReminder.className = 'noteReminder active';
        noteReminder.title = moment(remindTimestamp).format('YYYY-MM-DD HH:mm');
        noteReminder.innerHTML = iconReminder;
        // Preserve expaned state of parent notes before re-render
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
        syncReminderToMain();
      }, { alignRight: true, onRemove: () => {
        dbUpdate('note', note.id, { remind: null });
        note.remind = null;
        noteReminder.className = 'noteReminder';
        noteReminder.title = '';
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
        syncReminderToMain();
      }});
    });

    noteDueDate.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (dueDatePicker.isOpen()) {
        dueDatePicker.close();
        return;
      }

      dueDatePicker.onClose = null;
      dueDatePicker.show(noteDueDate, note.due, (dateTime) => {
        const dueDateTimestamp = new Date(dateTime).getTime();
        dbUpdate('note', note.id, { due: dueDateTimestamp });
        note.due = dueDateTimestamp;
        noteDueDate.className = 'noteDueDate active';
        noteDueDate.title = moment(dueDateTimestamp).format('YYYY-MM-DD');
        noteDueDate.innerHTML = iconDueDateActive;
        // Preserve expaned state of parent notes before re-render
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
      }, { alignRight: true, hideTime: true, onRemove: () => {
        dbUpdate('note', note.id, { due: null });
        note.due = null;
        noteDueDate.className = 'noteDueDate';
        noteDueDate.title = '';
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
      }});
    });

    // Prevent noteInput focusout when clicking action buttons, so the click event fires while edit mode is still active
    noteItem.addEventListener('mousedown', (e) => {
      if (e.target.closest('.notePin, .noteRemove, .noteSub, .noteReminder, .noteDueDate, .noteCollapse')) {
        e.preventDefault();
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
    let subNoteDueDate = document.createElement('span');
    let subNoteReminder = document.createElement('span');
    let subNoteMoment = document.createElement('span');
    let subNoteRemove = document.createElement('span');
    subNoteItem.draggable = true;
    subNoteItem.dataset.id = subNote.id;
    subNoteItem.dataset.index = order;
    subNoteItem.className = updateCompletionStyle(subNote.due, subNote.dateCompleted);
    subNoteCheckbox.type = 'checkbox';
    subNoteCheckbox.checked = subNote.completed;
    subNoteInput.type = 'text';
    subNoteInput.className = 'noteContent';
    subNoteInput.value = subNote.content;
    subNoteInput.readOnly = true;
    subNoteDueDate.className = subNote.due ? 'noteDueDate active' : 'noteDueDate';
    subNoteDueDate.title = subNote.due ? translate('__due_at__') + ' ' + moment(subNote.due).format('YYYY-MM-DD') : '';
    subNoteDueDate.innerHTML = subNote.due ? checkDueDateStatus(subNoteDueDate, subNote.due, subNote.dateCompleted) : iconDueDate;
    subNoteReminder.className = subNote.remind ? 'noteReminder active' : 'noteReminder';
    subNoteReminder.title = subNote.remind ? translate('__remind_me_at__') + ' ' + moment(subNote.remind).format('YYYY-MM-DD HH:mm') : '';
    subNoteReminder.innerHTML = subNote.remind ? iconReminderActive : iconReminder;
    subNoteMoment.className = 'noteMoment';
    subNoteMoment.innerText = moment(subNote.dateCreated).fromNow();
    subNoteMoment.title = moment(subNote.dateCreated).format('YYYY-MM-DD HH:MM');
    subNoteRemove.className = 'icon noteRemove';
    subNoteRemove.innerText = '-';
    subNoteRemove.dataset['langTitle'] = '__remove__';
    subNoteRemove.title = translate('__remove__') || 'Remove';

    subNoteItem.append(subNoteCheckbox);
    subNoteItem.append(subNoteInput);
    subNoteItem.append(subNoteDueDate);
    subNoteItem.append(subNoteReminder);
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
          subNote.content = newVal;
        }
        subNoteInput.readOnly = true;
        setTimeout(()=>{
          subNoteItem.classList.remove('edit');
        },100);
      }
    });

    subNoteInput.addEventListener('focusout', (e) => {
      if (!subNoteInput.readOnly) {
        let newVal = subNoteInput.value.trim();
        let targetId = parseInt(subNoteItem.dataset.id);
        if (newVal && newVal != subNote.content) {
          dbUpdate('note', targetId, {content: newVal});
          subNote.content = newVal;
        }
        subNoteInput.readOnly = true;
        subNoteItem.classList.remove('edit');
      }
    });

    subNoteRemove.addEventListener('click', (e) => {
      e.preventDefault();
      let targetId = parseInt(e.target.parentNode.dataset.id);

      subNoteItem.remove();
      updateSortIndexes(area);
      deleteNote(targetId);

      // If parent has no more subnotes, hide collapse icon and remove parent status
      const parentEl = document.querySelector(`#panelNote li[data-id="${subnote.parent}"]`);
      if (parentEl) {
        const remainingSubnotes = parentEl.querySelectorAll('.noteSubList li');
        if (remainingSubnotes.length === 0) {
          parentEl.classList.remove('parent', 'expand');
          const collapseBtn = parentEl.querySelector('.noteCollapse');
          if (collapseBtn) collapseBtn.classList.remove('show', 'active');
          dbUpdate('note', subNote.parent, { parent: 0 });
        }
        updateCompletionPercentage(subNote.parent);
      }
    });

    subNoteReminder.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (reminderPicker.isOpen()) {
        reminderPicker.close();
        return;
      }

      reminderPicker.onClose = null;
      reminderPicker.show(subNoteReminder, subNote.remind, (dateTime) => {
        const remindTimestamp = new Date(dateTime).getTime();
        dbUpdate('note', subNote.id, { remind: remindTimestamp });
        subNote.remind = remindTimestamp;
        subNoteReminder.className = 'noteReminder active';
        subNoteReminder.title = moment(remindTimestamp).format('YYYY-MM-DD HH:mm');
        subNoteReminder.innerHTML = iconReminder;
        // Preserve expanded state of parent notes before re-render
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
        syncReminderToMain();
      }, { alignRight: true, onRemove: () => {
        dbUpdate('note', subNote.id, { remind: null });
        subNote.remind = null;
        subNoteReminder.className = 'noteReminder';
        subNoteReminder.title = '';
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
        syncReminderToMain();
      }});
    });

    subNoteDueDate.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (dueDatePicker.isOpen()) {
        dueDatePicker.close();
        return;
      }

      dueDatePicker.onClose = null;
      dueDatePicker.show(subNoteDueDate, subNote.due, (dateTime) => {
        const dueTimestamp = new Date(dateTime).getTime();
        dbUpdate('note', subNote.id, { due: dueTimestamp });
        subNote.due = dueTimestamp;
        subNoteDueDate.className = 'noteDueDate active';
        subNoteDueDate.title = moment(dueTimestamp).format('YYYY-MM-DD HH:mm');
        subNoteDueDate.innerHTML = iconDueDateActive;
        // Preserve expanded state of parent notes before re-render
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
      }, { alignRight: true, hideTime: true, onRemove: () => {
        dbUpdate('note', subNote.id, { due: null });
        subNote.due = null;
        subNoteDueDate.className = 'noteDueDate';
        subNoteDueDate.title = '';
        document.querySelectorAll('#panelNote li.expand').forEach(li => {
          Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
        });
        renderNotes(parseInt(localStorage.getItem('listActive')));
      }});
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

    // Prevent subNoteInput focusout when clicking action buttons, so the click event fires while edit mode is still active
    subNoteItem.addEventListener('mousedown', (e) => {
      if (e.target.closest('.noteRemove, .noteReminder, noteDueDate')) {
        e.preventDefault();
      }
    });

  }

  function cleanModal() {
    const modals = document.querySelectorAll('.modal');
    const btnSettings = document.getElementById('btnSettings');
    const btnReport = document.getElementById('btnReport');
    const panelNote = document.getElementById('panelNote');
    const hiddenActivedList =  document.querySelector('#areaListLists input.hidden');
    btnSettings.classList.remove('active');
    btnReport.classList.remove('active');
    panelNote.classList.remove('showModal');
    modals.forEach(modal => {
      modal.classList.remove('open');
    });
    if(hiddenActivedList) {
      hiddenActivedList.classList.remove('hidden');
    }
  }

  /**
   * Initialize drag-and-drop for the sidebar list of lists.
   */
  function initListDnD() {
    const listEl = document.querySelector('#areaListLists ul');
    if (listEl.sortable) {
      listEl.sortable.destroy();
    }
    listEl.sortable = Sortable.create(listEl, {
      animation: 150,
      direction: 'vertical',
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      filter: "li.edit input",
      preventOnFilter: false,
      onEnd: function () {
        updateSortIndexes('areaListLists');
      }
    });
  }

  /**
   * Initialize drag-and-drop for a note area (parent notes + sub-note lists).
   * @param {string} areaName 'areaListNotes' or 'areaPinNotes'
   */
  function initNoteDnD(areaName) {
    // Main note list
    const mainList = document.querySelector(`#${areaName} ul`);
    initSortableOnNoteList(mainList, areaName);

    // All sub-note lists within the area
    const subLists = document.querySelectorAll(`#${areaName} ul ul`);
    subLists.forEach(subList => initSortableOnNoteList(subList, areaName));
  }

  function initSortableOnNoteList(listEl, areaName) {
    if (listEl.sortable) {
      listEl.sortable.destroy();
    }
    listEl.sortable = Sortable.create(listEl, {
      group: areaName,
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
      // Prevent dragging a parent note with children into another note's sublist
      if (evt.dragged.querySelectorAll('.noteSubList li').length > 0 && evt.related.parentElement.classList.contains('noteSubList')) {
          return false;
        }
      },
      onEnd:function (evt) {
        let currentListId = parseInt(document.querySelector('#areaListLists input.active').dataset.id);
        let sourceTaskId = parseInt(evt.item.dataset.id);
        let sourceParentTaskId = parseInt(evt.from.parentElement.dataset.id);
        let targetTaskId = parseInt(evt.to.parentElement.dataset.id);
        let structureChanged = false;

        // subnote promoted to parent note
        if (evt.from.classList.contains('noteSubList') && !evt.to.classList.contains('noteSubList')) {
          structureChanged = true;
          if (evt.from.childElementCount == 0) {
            dbUpdate('note', sourceParentTaskId, { parent: 0 });
            // Remove parent indicators from source parent
            const sourceParentEl = evt.from.parentElement;
            if (sourceParentEl) {
              sourceParentEl.classList.remove('parent', 'expand');
              const collapseBtn = sourceParentEl.querySelector('.noteCollapse');
              if (collapseBtn) collapseBtn.classList.remove('show', 'active');
            }
          }
          dbUpdate('note', sourceTaskId, { parent: 0 });

          // Replace subnote element with a full parent note element in-place
          const noteData = Zeke.notes.find(n => n.id === sourceTaskId);
          if (noteData) {
            noteData.parent = 0;
            const nextSibling = evt.item.nextElementSibling;
            const container = evt.item.parentElement;
            evt.item.remove();
            generateNoteItem(noteData, areaName, 0, true);
            const newItem = container.querySelector(`li[data-id="${sourceTaskId}"]`);
            if (newItem && nextSibling) {
              container.insertBefore(newItem, nextSibling);
            }
          }
          updateCompletionPercentage(sourceParentTaskId);
        }
        // parent note demoted to subnote
        if (evt.item.querySelector('span.noteSub') && evt.to.classList.contains('noteSubList')) {
          structureChanged = true;
          dbUpdate('note', sourceTaskId, { parent: targetTaskId });
          dbUpdate('note', targetTaskId, { parent: true });

          // Replace parent note element with a subnote element in-place
          const noteData = Zeke.notes.find(n => n.id === sourceTaskId);
          if (noteData) {
            noteData.parent = targetTaskId;
            const nextSibling = evt.item.nextElementSibling;
            const container = evt.item.parentElement;
            evt.item.remove();
            generateSubNoteItem(noteData, areaName, 0, true);
            const newItem = container.querySelector(`li[data-id="${sourceTaskId}"]`);
            if (newItem && nextSibling) {
              container.insertBefore(newItem, nextSibling);
            }
          }
          // Update target parent's collapse state
          const targetParentEl = document.querySelector(`#panelNote li[data-id="${targetTaskId}"]`);
          if (targetParentEl) {
            targetParentEl.classList.add('parent', 'expand');
            const collapseBtn = targetParentEl.querySelector('.noteCollapse');
            if (collapseBtn) collapseBtn.classList.add('show', 'active');
          }
          updateCompletionPercentage(targetTaskId);
        }
        // subnote moved to a different parent's sublist
        if (evt.from.classList.contains('noteSubList') && evt.to.classList.contains('noteSubList') && evt.from !== evt.to) {
          structureChanged = true;
          if (evt.from.childElementCount == 0) {
            dbUpdate('note', sourceParentTaskId, { parent: 0 });
            const sourceParentEl = evt.from.parentElement;
            if (sourceParentEl) {
              sourceParentEl.classList.remove('parent', 'expand');
              const collapseBtn = sourceParentEl.querySelector('.noteCollapse');
              if (collapseBtn) collapseBtn.classList.remove('show', 'active');
            }
          }
          dbUpdate('note', targetTaskId, { parent: true });
          dbUpdate('note', sourceTaskId, { parent: targetTaskId });

          // Replace subnote element so its event listeners reference the new parent
          const noteData = Zeke.notes.find(n => n.id === sourceTaskId);
          if (noteData) {
            noteData.parent = targetTaskId;
            const nextSibling = evt.item.nextElementSibling;
            const container = evt.item.parentElement;
            evt.item.remove();
            generateSubNoteItem(noteData, areaName, 0, true);
            const newItem = container.querySelector(`li[data-id="${sourceTaskId}"]`);
            if (newItem && nextSibling) {
              container.insertBefore(newItem, nextSibling);
            }
          }
          // Update target parent's collapse state
          const targetParentEl = document.querySelector(`#panelNote li[data-id="${targetTaskId}"]`);
          if (targetParentEl) {
            targetParentEl.classList.add('parent', 'expand');
            const collapseBtn = targetParentEl.querySelector('.noteCollapse');
            if (collapseBtn) collapseBtn.classList.add('show', 'active');
          }
          updateCompletionPercentage(sourceParentTaskId);
          updateCompletionPercentage(targetTaskId);
        }
          
        updateSortIndexes(areaName);
        // Re-init sortable on sublists when structure changed (new sublists may exist)
        if (structureChanged) {
          initNoteDnD(areaName);
        }
      }
    });
  }

  function updateSortIndexes(areaName) {
    if (areaName === 'areaListLists') {
      const items = document.querySelectorAll('#areaListLists ul li');
      const newOrder = Array.from(items).map(item => item.dataset.id);
      localStorage.setItem('listOrder', newOrder.join(','));
      return;
    }

    const items = document.querySelectorAll(`#${areaName} ul li`);
    const areaToKey = { "areaListNotes": "orderedNoteIds", "areaPinNotes": "orderedPinNoteIds" };
    let currentListId = parseInt(document.querySelector('#areaListLists input.active').dataset.id);
    let newOrder = [];
    items.forEach(item => {
      newOrder.push(parseInt(item.dataset.id));
    });
    Zeke[areaToKey[areaName]][currentListId] = newOrder;
    dbUpdate('list', currentListId, { [areaName]: newOrder });
  }

  function animateCompletion(element, from, to, duration = 300) {
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current = from + (to - from) * progress;
      element.style.setProperty('--completion', `${current.toFixed(1)}%`);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  function updateCompletionPercentage(parentId) {
    const parentNote = document.querySelector(`#panelNote li[data-id="${parentId}"]`);
    if (!parentNote) return;
    const parentCompletionButton = parentNote.querySelector(`input[type="checkbox"]`);
    const subnoteCompletedCount = parentNote.querySelectorAll('.noteSubList li.completed').length;
    const subnoteTotalCount = parentNote.querySelectorAll('.noteSubList li').length;
    const completionPercentage = (subnoteCompletedCount / subnoteTotalCount * 100).toFixed();
    const currentCompletion = parseFloat(parentCompletionButton.style.getPropertyValue('--completion')) || 0;

    if(completionPercentage == 100) {
      animateCompletion(parentCompletionButton, currentCompletion, 100);
      parentCompletionButton.classList.remove('has-progress');
      if(!parentNote.classList.contains('completed')) {
        parentCompletionButton.click();
      }
    } else {
      if(parentNote.classList.contains('completed')) {
        parentNote.classList.remove('completed');
        parentCompletionButton.checked = false;
      }
      const currentThemeStrokeColor = getCurrentThemeColor(true);
      const overdue = parentNote.classList.contains('overdue');
      const dueToday = parentNote.classList.contains('due-today');
      let fillColor = currentThemeStrokeColor ? currentThemeStrokeColor + '66' : '#cccccccc';

      if (overdue) {
        fillColor = '#900';
      }
      if (dueToday) {
        fillColor = '#ff9800';
      }
      
      parentCompletionButton.style.setProperty('--fill-color', fillColor);
      parentCompletionButton.classList.add('has-progress');
      animateCompletion(parentCompletionButton, currentCompletion, parseFloat(completionPercentage));
    }
  }

  function updateCompletionStyle(duedate, dateCompleted) {
    let className = '';

    if (dateCompleted) {
      className = 'completed';

      if (duedate && moment(duedate).isBefore(dateCompleted, 'day')) {
        className = 'completed overdue';
      }
      if (duedate && moment(duedate).isAfter(dateCompleted, 'day')) {
        className = 'completed on-time';
      }
    } else {
      if (duedate && moment(duedate).isBefore(Date.now(), 'day')) {
        className = 'overdue';
      }
      if (duedate && moment(duedate).isSame(Date.now(), 'day')) {
        className = 'due-today';
      }
    }

    return className;
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
      let noteContentEl = note.querySelector('input.noteContent');
      if (!noteContentEl) return;
      let noteContent = noteContentEl.value;
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
    const btnReminder = document.getElementById('btnReminder');
    const btnDueDate = document.getElementById('btnDueDate');
    const reminderPickerInput = document.getElementById('reminderPickerInput');
    const listId = document.querySelector('#areaListLists li input.active').dataset.id;
    if(noteContent && listId && document.getElementById('btnFilter').className === '') {
      addNote({
        list: parseInt(listId), 
        content: noteContent,
        completed: false,
        dateCreated: Date.now(),
        dateCompleted: '',
        parent: 0,
        remind: btnReminder.dataset.remindValue ? new Date(btnReminder.dataset.remindValue).getTime() : null,
        due: btnDueDate.dataset.dueValue ? new Date(btnDueDate.dataset.dueValue).getTime() : null
      });
    }
    document.getElementById('txtNew').value = '';
    btnReminder.dataset.remindValue = '';
    btnDueDate.dataset.dueValue = '';
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
    const btnReminder = document.getElementById('btnReminder');
    const btnDueDate = document.getElementById('btnDueDate');
    const areaNew = document.getElementById('areaNew');
    if(btnFilter.className !== 'active' && btnFilter.className !== 'hide' && !btnReminder.classList.contains('set') && !btnDueDate.classList.contains('set')) {
      areaNew.style.gridTemplateColumns = '0 1fr 30px 30px 30px';
      btnFilter.style.display = 'none';
      btnReminder.classList.add('active');
      btnDueDate.classList.add('active');
    }
  });

  let txtNewFocusoutTimer = null;
  document.getElementById('txtNew').addEventListener('focusout', (e) => {
    const btnFilter = document.getElementById('btnFilter');
    const areaNew = document.getElementById('areaNew');
    const btnReminder = document.getElementById('btnReminder');
    const btnDueDate = document.getElementById('btnDueDate');
    txtNewFocusoutTimer = setTimeout(() => {
      // Don't hide if picker is open or reminder button is being used
      if (reminderPicker.isOpen() || dueDatePicker.isOpen()) return;
      if (btnFilter.className !== 'active') {
        const txtNew = document.getElementById('txtNew');
        // Keep button visible only if 'set' AND txtNew has content
        if (txtNew.value.trim() !== '') {
          btnFilter.className = '';
          btnFilter.style.display = 'none';
          areaNew.style.gridTemplateColumns = '0 1fr 30px 30px 30px';
        } else {
          btnFilter.className = '';
          btnFilter.style = '';
          btnReminder.className = '';
          btnDueDate.className = '';
          areaNew.style.gridTemplateColumns = 'auto 1fr 30px';
        }
      }
    }, 150);
  });
  // Shared DateTimePicker for all date/time selections (reminder, due date, etc.)
  const reminderPicker = new DateTimePicker(document.getElementById('sharedDateTimePicker'));
  const dueDatePicker = new DateTimePicker(document.getElementById('sharedDateTimePicker'));

  document.getElementById('btnReminder').addEventListener('click', (e) => {
    e.stopPropagation();

    if (reminderPicker.isOpen()) {
      reminderPicker.close();
      return;
    }

    const btnReminder = document.getElementById('btnReminder');
    reminderPicker.onClose = () => hideReminderButton();
    reminderPicker.show(btnReminder, null, (dateTime) => {
      const txtNew = document.getElementById('txtNew');
      btnReminder.dataset.remindValue = dateTime;
      btnReminder.className = 'active set';
      document.getElementById('iconReminderOutline').style.display = 'none';
      document.getElementById('iconReminderSolid').style.display = 'inline';
      txtNew.focus();
    }, { alignRight: true });
  });

  document.getElementById('btnDueDate').addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(txtNewFocusoutTimer);

    if (dueDatePicker.isOpen()) {
      dueDatePicker.close();
      return;
    }

    const btnDueDate = document.getElementById('btnDueDate');
    dueDatePicker.onClose = () => hideReminderButton();
    dueDatePicker.show(btnDueDate, null, (dateTime) => {
      const txtNew = document.getElementById('txtNew');
      btnDueDate.dataset.dueValue = dateTime;
      btnDueDate.className = 'active set';
      document.getElementById('iconDueDateOutline').style.display = 'none';
      document.getElementById('iconDueDateSolid').style.display = 'inline';
      txtNew.focus();
    }, { alignRight: true, hideTime: true });
  });

  document.addEventListener('click', (e) => {
    const btnReminder = document.getElementById('btnReminder');
    const btnDueDate = document.getElementById('btnDueDate');
    const iconReminderOutline = document.getElementById('iconReminderOutline');
    const iconReminderSolid = document.getElementById('iconReminderSolid');
    const iconDueDateOutline = document.getElementById('iconDueDateOutline');
    const iconDueDateSolid = document.getElementById('iconDueDateSolid');
    if (reminderPicker.isOpen() && !reminderPicker.el.contains(e.target) && !btnReminder.contains(e.target) && !e.target.closest('.noteReminder')) {
      reminderPicker.close();
    }
    if (dueDatePicker.isOpen() && !dueDatePicker.el.contains(e.target) && !btnDueDate.contains(e.target) && !e.target.closest('.noteDueDate')) {
      dueDatePicker.close();
    }
    if (!btnReminder.classList.contains('set') && !reminderPicker.isOpen()) {
      iconReminderOutline.style.display = 'inline';
      iconReminderSolid.style.display = 'none';
    }
    if (!btnDueDate.classList.contains('set') && !dueDatePicker.isOpen()) {
      iconDueDateOutline.style.display = 'inline';
      iconDueDateSolid.style.display = 'none';
    }
  });

  function hideReminderButton() {
    const btnReminder = document.getElementById('btnReminder');
    const areaNew = document.getElementById('areaNew');
    const btnFilter = document.getElementById('btnFilter');
    const txtNew = document.getElementById('txtNew');
    // Preserve 'set' state if reminder was confirmed with text
    const hasSet = btnReminder.classList.contains('set');
    if (hasSet && txtNew.value.trim() !== '') {
      btnReminder.className = 'active set';
      btnFilter.style.display = 'none';
    } else {
      btnReminder.className = '';
    }
    // Only reset grid if txtNew is not focused
    if (document.activeElement !== txtNew && btnFilter.className !== 'active') {
      areaNew.style.gridTemplateColumns = 'auto 1fr 30px';
      btnFilter.style.display = '';
    }
  }

  function hideDueDateButton() {
    const btnDueDate = document.getElementById('btnDueDate');
    const areaNew = document.getElementById('areaNew');
    const btnFilter = document.getElementById('btnFilter');
    const txtNew = document.getElementById('txtNew');
    // Preserve 'set' state if reminder was confirmed with text
    const hasSet = btnDueDate.classList.contains('set');
    if (hasSet && txtNew.value.trim() !== '') {
      btnDueDate.className = 'active set';
      btnFilter.style.display = 'none';
    } else {
      btnDueDate.className = '';
    }
    // Only reset grid if txtNew is not focused
    if (document.activeElement !== txtNew && btnFilter.className !== 'active') {
      areaNew.style.gridTemplateColumns = 'auto 1fr 30px';
      btnFilter.style.display = '';
    }
  }

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

  Zeke.getLists = getLists;
  Zeke.renderNotes = renderNotes;

  getLists();
  renderNotes(
    parseInt(localStorage.getItem('listActive'))
  );

  // Sync reminders to main process for reliable timer-based notification
  function syncRemindersToMain() {
    const transaction = db.transaction(['note'], 'readonly');
    const objectStore = transaction.objectStore('note');
    const req = objectStore.getAll();
    req.onsuccess = function(event) {
      const notes = event.target.result;
      const pending = notes
        .filter(n => n.remind && !n.completed)
        .map(n => ({ id: n.id, remind: n.remind, content: n.content, title: translate('__reminder__') || 'Reminder' }));
      window.electronAPI.syncReminders(pending);
    };
  }
  syncRemindersToMain();

  // Listen for fired reminders from main process and clear them in DB
  window.electronAPI.onReminderFired((noteId) => {
    dbUpdate('note', noteId, { remind: null });
    // Preserve expanded state before re-render
    document.querySelectorAll('#panelNote li.expand').forEach(li => {
      Zeke.expandedNotesIds.add(parseInt(li.dataset.id));
    });
    renderNotes(parseInt(localStorage.getItem('listActive')));
  });

};

function restructureGrid(pro = false) {
  const panelContainer = document.getElementById('panelsContainer');
  const rememberedGrid = localStorage.getItem('grid-template-columns') || (pro ? '50px 100px 10px 1fr' : '0 100px 10px 1fr');
  const listOpened = JSON.parse(localStorage.getItem('listOpened'));
  let rememberedGridArray = rememberedGrid.split(' ');

  // comtiability with old version
  if (rememberedGridArray.length < 4) {
    rememberedGridArray.unshift(pro ? '50px' : '0');
  }
  if (!pro && (rememberedGridArray[0] !== '0px' || rememberedGridArray[0] !== '0')) {
    rememberedGridArray[0] = '0';
  }

  panelsContainer.style.gridTemplateColumns = rememberedGridArray[0] + ' ' + (listOpened ? rememberedGridArray[1] + ' 10px' : '0 0') + ' 1fr';
  localStorage.setItem('grid-template-columns', rememberedGridArray[0] + ' ' + rememberedGridArray[1] + ' 10px 1fr');

  if (pro) {
    document.getElementById('btnSwitchNavbar').style.display = 'block';
    document.getElementById('btnSettings_SE').style.display = 'none';
  } else {
    document.getElementById('btnSwitchNavbar').style.display = 'none';
    document.getElementById('btnSettings_SE').style.display = 'block';
  }
}

function initGrid() {

  let isPro = false;

  // Check license status and adjust grid accordingly
  if (window.electronAPI && window.electronAPI.licenseGet) {
    window.electronAPI.licenseGet().then(result => {
      restructureGrid(result.valid);
      isPro = result.valid;
    });
  } else {
    restructureGrid(isPro);
  }

  const gutter = document.getElementById('gutter');
  const panelList = document.getElementById('panelList');
  const panelsContainer = document.getElementById('panelsContainer');
  const rememberedGrid = localStorage.getItem('grid-template-columns') || '0 100px 10px 1fr';
  const listOpened = JSON.parse(localStorage.getItem('listOpened'));

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  let startNavWidth = '0';
  let arrayRememberedGrid = rememberedGrid.split(' ');

  panelsContainer.classList.add('toggling');

  gutter.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseFloat(getComputedStyle(panelList).width);
    // Capture the current navbar column width at resize start
    const currentGrid = panelsContainer.style.gridTemplateColumns.split(' ');
    startNavWidth = currentGrid[0] || '0';
    panelsContainer.classList.remove('toggling'); // disable animation for toggle nav and list when resizing
  });

  document.addEventListener('mousemove', (e) => {
    if (isResizing) {
      panelsContainer.classList.add('resizing');
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
        isResizing = false;
      }
      panelsContainer.setAttribute('style',`grid-template-columns: ${startNavWidth} ${widthList}px ${widthGutter}px 1fr;`);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      localStorage.setItem('grid-template-columns', panelsContainer.style['grid-template-columns']);
      panelsContainer.classList.remove('resizing');
      panelsContainer.classList.add('toggling');
    }
  });

  panelsContainer.addEventListener('mouseup', () => {
    isResizing = false;
  });

}

function initModalSettings() {
  const modalSettings = document.querySelector('.modal.settings');
  const modalReport = document.querySelector('.modal.report');
  const themes = document.querySelectorAll('.themeSelection');
  const modes = document.querySelectorAll('.modeSelection');
  const btnSettings = document.getElementById('btnSettings');
  const btnSettings_SE = document.getElementById('btnSettings_SE');
  const btnReport = document.getElementById('btnReport');
  const btnTask = document.getElementById('btnTask');
  const panelNote = document.getElementById('panelNote');
  const panelsContainer = document.getElementById('panelsContainer');
  const btnSwitchNavbar = document.getElementById('btnSwitchNavbar');
  const opacitySelection = document.getElementById('opacitySelection');
  const languageList = document.getElementById('languageList');
  const btnExport = document.getElementById('btnExport');
  const btnReset = document.getElementById('btnReset');
  const clear = document.getElementById('clear');
  const txtUpgrade = document.getElementById('editionUpgrade');
  const opacity = localStorage.getItem('opacity') || '100';
  const rememberedLanguage = localStorage.getItem('language') || 'en';
  const btnBackup = document.getElementById('btnBackup');
  const btnRestore = document.getElementById('btnRestore');
  const restoreModeModal = document.getElementById('restoreModeModal');
  const restoreModeDesc = restoreModeModal ? restoreModeModal.querySelector('.restore-mode-desc') : null;
  const restoreModeMerge = document.getElementById('restoreModeMerge');
  const restoreModeReplace = document.getElementById('restoreModeReplace');
  const restoreModeCancel = document.getElementById('restoreModeCancel');
  const rememberedTheme = localStorage.getItem('theme') || 'origin-theme-light';

  btnSettings.addEventListener('click', () => {
    const activedList = document.querySelector('#areaListLists input.active');
    
    btnReport.classList.remove('active');
    modalReport.classList.remove('open');

    if(modalSettings.classList.contains('open')) {
      panelNote.classList.remove('showModal');
      modalSettings.classList.remove('open');
      activedList.classList.remove('hidden');
      btnSettings.classList.remove('active');
      btnTask.classList.add('active');
      panelsContainer.style.gridTemplateColumns = localStorage.getItem('grid-template-columns') || '50px 100px 10px 1fr';
      activedList.click();
    } else {
      if(!modalReport.classList.contains('open')) {
        btnTask.classList.add('active');
      }
      panelNote.classList.add('showModal');
      modalSettings.classList.add('open');
      activedList.classList.add('hidden');
      btnSettings.classList.add('active');
      panelsContainer.style.gridTemplateColumns = '50px 0 0 1fr';
    }
  });

  btnSettings_SE.addEventListener('click', () => {
    const activedList = document.querySelector('#areaListLists input.active');

    if(modalSettings.classList.contains('open')) {
      panelNote.classList.remove('showModal');
      modalSettings.classList.remove('open');
      activedList.classList.remove('hidden');
      btnSettings_SE.classList.remove('active');
      btnTask.classList.add('active');
      activedList.click();
    } else {
      if(!modalReport.classList.contains('open')) {
        btnTask.classList.add('active');
      }
      panelNote.classList.add('showModal');
      modalSettings.classList.add('open');
      activedList.classList.add('hidden');
      btnSettings_SE.classList.add('active');
    }
  });

  btnSwitchNavbar.addEventListener('click', () => {
    let panelsContainer = document.getElementById('panelsContainer');
    const currentGrid = panelsContainer.style.gridTemplateColumns.split(' ');
    const rememberedGrid = localStorage.getItem('grid-template-columns') || '50px 100px 10px 1fr';
    let arrayRememberedGrid = rememberedGrid.split(' ');
    let isNavOpened = currentGrid[0] == '50px';
    
    arrayRememberedGrid[0] = isNavOpened ? '0px' : '50px';
    document.querySelector('.switcherIcon').classList.toggle('open');
    
    let newGrid = arrayRememberedGrid.join(' ');
    panelsContainer.style.gridTemplateColumns = newGrid;
    localStorage.setItem('grid-template-columns', newGrid);
  });

  languageList.addEventListener('change', e => {
    changeLanguage(e.detail.value);
    localStorage.setItem('language', e.detail.value);
  });

  initCustomSelect(languageList, rememberedLanguage);

  themes.forEach(theme => {

    if (rememberedTheme === theme.dataset.id) {
      theme.classList.add('selected');
    }

    theme.addEventListener('click', (e) => {
      const selectedMode = document.querySelector('.modeSelection.selected');
      const selectedTheme = document.querySelector('.themeSelection.selected');
      if (selectedMode) selectedMode.classList.remove('selected');
      if (selectedTheme) selectedTheme.classList.remove('selected');
      e.target.classList.add('selected');

      document.body.className = e.target.dataset.id;
      localStorage.setItem('theme', e.target.dataset.id);
      Zeke_ChartTimeline.data.datasets[0].borderColor = getCurrentThemeColor();
      Zeke_ChartTimeline.data.datasets[0].backgroundColor = getCurrentThemeColor() + '33';
      Zeke_ChartTimeline.data.datasets[1].borderColor = getCurrentThemeColor(true);
      Zeke_ChartTimeline.data.datasets[1].backgroundColor = getCurrentThemeColor(true) + '33';
    });
  });

  modes.forEach(mode => {

    if (rememberedTheme === mode.dataset.id) {
      mode.classList.add('selected');
    }

    mode.addEventListener('click', (e) => {
      const selectedMode = document.querySelector('.modeSelection.selected');
      const selectedTheme = document.querySelector('.themeSelection.selected');
      if (selectedMode) selectedMode.classList.remove('selected');
      if (selectedTheme) selectedTheme.classList.remove('selected');
      e.target.classList.add('selected');

      // If auto mode is selected, determine the theme based on system preference
      if (e.target.id === 'mode-auto') {
        applyAutoTheme();
      } else {
        document.body.className = e.currentTarget.dataset.id;
      }

      localStorage.setItem('theme', e.currentTarget.dataset.id);
    });
  });

  opacitySelection.value = opacity;
  opacitySelection.addEventListener('click', (e) => {
    document.body.style.opacity = e.target.value + '%';
    localStorage.setItem('opacity', e.target.value);
  });

  const BACKUP_LOCAL_STORAGE_KEYS = [
    'noteOrder',
    'pinNoteOrder',
    'listOrder',
    'theme',
    'opacity',
    'bounds',
    'listActive',
    'language',
    'grid-template-columns',
    'listOpened',
    'alwaysOnTop'
  ];

  function readAllFromStore(store) {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = (event) => resolve(event.target.result || []);
      req.onerror = () => reject(req.error || new Error('Failed to read object store.'));
    });
  }

  async function collectBackupData() {
    const transaction = neonoteDb.transaction(['note', 'list'], 'readonly');
    const noteStore = transaction.objectStore('note');
    const listStore = transaction.objectStore('list');
    const [notes, lists] = await Promise.all([readAllFromStore(noteStore), readAllFromStore(listStore)]);

    const settings = {};
    BACKUP_LOCAL_STORAGE_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null && value !== undefined) {
        settings[key] = value;
      }
    });

    return {
      backupSchemaVersion: 1,
      createAt: new Date().toISOString(),
      data: {
        notes,
        lists,
        settings
      }
    };
  }

  function writeSettingFromBackup(settings, mode) {
    if (!settings || typeof settings !== 'object') {
      return;
    }

    if (mode === 'replace') {
      BACKUP_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      Object.keys(settings).forEach((key) => {
        localStorage.setItem(key, settings[key]);
      });
      return;
    }

    Object.keys(settings).forEach((key) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, settings[key]);
      }
    });
  }

  async function applyBackupData(plainBackup, mode) {
    if (!plainBackup || !plainBackup.data) {
      throw new Error('Backup payload is missing data.');
    }

    const notes = Array.isArray(plainBackup.data.notes) ? plainBackup.data.notes : [];
    const lists = Array.isArray(plainBackup.data.lists) ? plainBackup.data.lists : [];
    const transaction = neonoteDb.transaction(['note', 'list'], 'readwrite');
    const noteStore = transaction.objectStore('note');
    const listStore = transaction.objectStore('list');

    if (mode === 'replace') {
      listStore.clear();
      noteStore.clear();
    }

    lists.forEach((list) => {
      if (list && typeof list === 'object') {
        listStore.put(list);
      }
    });

    notes.forEach((note) => {
      if (note && typeof note === 'object') {
        noteStore.put(note);
      }
    });

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Failed to apply backup data.'));
      transaction.onabort = () => reject(transaction.error || new Error('Backup restore aborted.'));
    });

    writeSettingFromBackup(plainBackup.data.settings || {}, mode);
  }

  function backupDefaultFileName() {
    return 'inneroutliner_backup_' + new Date().toISOString().slice(0, 10) + '.ioeb.json';
  }

  function showRestoreInlinePanel(message, options = {}) {
    const {
      showMerge = false,
      showReplace = false,
      showCancel = false
    } = options;

    if (!restoreModeModal || !restoreModeDesc || !restoreModeMerge || !restoreModeReplace || !restoreModeCancel) {
      return Promise.resolve();
    }

    restoreModeDesc.innerText = message;
    restoreModeMerge.style.display = showMerge ? '' : 'none';
    restoreModeReplace.style.display = showReplace ? '' : 'none';
    restoreModeCancel.style.display = showCancel ? '' : 'none';
    restoreModeModal.classList.add('open');

    return Promise.resolve();
  }

  function pickRestoreMode() {
    return new Promise((resolve) => {
      if (!restoreModeModal || !restoreModeDesc || !restoreModeMerge || !restoreModeReplace || !restoreModeCancel) {
        resolve(null);
        return;
      }

      const cleanup = () => {
        restoreModeModal.classList.remove('open');
        restoreModeMerge.removeEventListener('click', onMerge);
        restoreModeReplace.removeEventListener('click', onReplace);
        restoreModeCancel.removeEventListener('click', onCancel);
        restoreModeCancel.style.display = 'none';
      };

      const finish = (mode) => {
        cleanup();
        resolve(mode);
      };

      const onMerge = () => finish('merge');
      const onReplace = () => finish('replace');
      const onCancel = () => finish(null);

      restoreModeDesc.innerText = translate('__select_how__restore_mode_desc__');
      restoreModeMerge.style.display = '';
      restoreModeReplace.style.display = '';
      restoreModeCancel.style.display = '';

      restoreModeModal.classList.add('open');
      restoreModeMerge.addEventListener('click', onMerge);
      restoreModeReplace.addEventListener('click', onReplace);
      restoreModeCancel.addEventListener('click', onCancel);
      restoreModeMerge.focus();
    });
  }

  btnExport.addEventListener('click', (e) => {
    const dbRequest = indexedDB.open('neonote', 1);
    dbRequest.onsuccess = function(event) {
      const exportDb = event.target.result;
      const transaction = exportDb.transaction(['note', 'list'], 'readonly');
      const noteStore = transaction.objectStore('note');
      const listStore = transaction.objectStore('list');

      const notesRequest = noteStore.getAll();
      const listsRequest = listStore.getAll();

      let allNotes = [];
      let allLists = [];

      notesRequest.onsuccess = function(e) { allNotes = e.target.result; };
      listsRequest.onsuccess = function(e) { allLists = e.target.result; };

      transaction.oncomplete = function() {
        const listMap = {};
        allLists.forEach(l => { listMap[l.id] = l.name; });

        const formatDate = (ts) => {
          if (!ts) return '';
          const d = new Date(ts);
          return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
        };

        const escapeCSV = (val) => {
          if (val == null) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };

        const headers = ['Id', 'List Id', 'List Name', 'Content', 'Is Completed', 'Date Created', 'Date Completed', 'Parent Id', 'Remind Date', 'Due Date'];
        const rows = [headers.join(',')];

        allNotes.forEach(note => {
          rows.push([
            escapeCSV(note.id),
            escapeCSV(note.list),
            escapeCSV(listMap[note.list] || ''),
            escapeCSV(note.content),
            escapeCSV(note.completed ? 'Yes' : 'No'),
            escapeCSV(formatDate(note.dateCreated)),
            escapeCSV(formatDate(note.dateCompleted)),
            escapeCSV(note.parent === true ? 'parent' : (note.parent || 0)),
            escapeCSV(formatDate(note.remind)),
            escapeCSV(formatDate(note.due))
          ].join(','));
        });

        const csvContent = rows.join('\n');
        const defaultName = 'inneroutliner_export_' + new Date().toISOString().slice(0, 10) + '.csv';
        window.electronAPI.saveFile(defaultName, csvContent);
      };
    };
  });

  btnReset.addEventListener('click', (e) => {
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

  btnBackup.addEventListener('click', async (e) => {
    try {
      const backupData = await collectBackupData();
      const backupText = JSON.stringify(backupData, null, 2);

      let result = null;
      if (window.electronAPI && window.electronAPI.saveTextFile) {
        result = await window.electronAPI.saveTextFile(
          backupDefaultFileName(),
          backupText,
          [{ name: 'Backup JSON', extensions: ['json', 'ioeb']}]
        );
      } else {
        const blob = new Blob([backupText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = backupDefaultFileName();
        link.click();
        URL.revokeObjectURL(url);
        result = { success: true };
      }

      if (result && result.success) {
        await showRestoreInlinePanel(translate('__backup_saved_successfully__'));
      }
    } catch (err) {
      console.error(err);
      await showRestoreInlinePanel(translate('__failed_to_create_backup__'));
    }
  });

  btnRestore.addEventListener('click', async (e) => {
    try {
      let backupText = null;

      if (window.electronAPI && window.electronAPI.openTextFile) {
        const openResult = await window.electronAPI.openTextFile([
          { name: 'Backup JSON', extensions: ['json', 'ioeb'] }
        ]);
        if (!openResult || !openResult.success) return;
        backupText = openResult.content;
      } else {
        backupText = await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,.ioeb';
          input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
          };
          input.click();
        });
        if (!backupText) return;
      }

      let encryptedPayload = null;
      try {
        encryptedPayload = JSON.parse(backupText);
      } catch (_err) {
        await showRestoreInlinePanel(translate('__invalid_backup_file_content__'));
        return;
      }

      let plainBackup;
      try {
        plainBackup = encryptedPayload;
      } catch (_err) {
        await showRestoreInlinePanel(translate('__invalid_backup_file_content__'));
        return;
      }

      const modeInput = await pickRestoreMode();
      if (modeInput !== 'merge' && modeInput !== 'replace') {
        await showRestoreInlinePanel(translate('__restore_canceled__'));
        return;
      }

      await applyBackupData(plainBackup, modeInput);

      if (modeInput === 'replace') {
        localStorage.setItem('listOpened', localStorage.getItem('listOpened') || 'true');
      }

      Zeke.expandedNotesIds.clear();
      Zeke.getLists();
      Zeke.renderNotes(parseInt(localStorage.getItem('listActive')));

      await showRestoreInlinePanel(translate('__restore_completed__'));
    } catch (err) {
      console.error(err);
      await showRestoreInlinePanel(translate('__failed_to_restore_backup__'));
    }
  });

  clear.addEventListener('click', (e) => {
    btnReset.click();
    window.indexedDB.deleteDatabase('neonote');
    location.reload();
  });

  txtUpgrade.addEventListener('click', () => {
    document.getElementById('license-section').classList.toggle('show');
  });

  // License activation
  const btnLicenseActive = document.getElementById('btnLicenseActive');
  const btnLicenseRemove = document.getElementById('btnLicenseRemove');
  const licenseInput = document.getElementById('license-input');

  // Load stored license on startup
  if (window.electronAPI && window.electronAPI.licenseGet) {
    window.electronAPI.licenseGet().then(result => {
      if (result.valid) {
        document.querySelector('.edition').innerText = 'Pro';
        licenseInput.value = '';
        licenseInput.placeholder = 'Licensed to ' + result.name + ' (' + result.email + ')';
        btnLicenseActive.style.display = 'none';
        btnLicenseRemove.style.display = 'inline-block';
        restructureGrid(true);
      } else {
        document.querySelector('.edition').innerText = 'SE';
        btnLicenseActive.style.display = 'inline-block';
        btnLicenseRemove.style.display = 'none';
        restructureGrid(false);
      }
    });

    btnLicenseActive.addEventListener('click', async () => {
      const licenseKey = licenseInput.value.trim();
      const activateMessage = document.getElementById('license-activate-message');
      if (!licenseKey) {
        return;
      }
      const result = await window.electronAPI.licenseActivate(licenseKey);
      if (result.valid) {
        const rememberedGrid = localStorage.getItem('grid-template-columns') || '50px 100px 10px 1fr';
        const rememberedGridArray = rememberedGrid.split(' ');

        document.querySelector('.edition').innerText = 'Pro';
        licenseInput.value = '';
        licenseInput.placeholder = 'Licensed to ' + result.name + ' (' + result.email + ')';
        btnLicenseActive.style.display = 'none';
        btnLicenseRemove.style.display = 'inline-block';
        btnSettings_SE.style.display = 'none';
        btnSwitchNavbar.style.display = 'block';

        if (rememberedGridArray[0] === '0px' || rememberedGridArray[0] === '0') {
          // first time activation from SE to Pro, open the navbar
          rememberedGridArray[0] = '50px';
          const newGrid = rememberedGridArray.join(' ');
          panelsContainer.style.gridTemplateColumns = newGrid;
          localStorage.setItem('grid-template-columns', newGrid);
        } else {
          restructureGrid(true);
        }

        activateMessage.innerText = translate('__license_activation_success__');
        activateMessage.classList.remove('error');
        activateMessage.classList.add('success');
        activateMessage.style.display = 'block';
        
      } else {
        activateMessage.innerText = result.message || translate('__license_activation_failed__');
        activateMessage.classList.remove('success');
        activateMessage.classList.add('error');
        activateMessage.style.display = 'block';
      }
    });

    btnLicenseRemove.addEventListener('click', async () => {
      const result = await window.electronAPI.licenseRemove();
      document.querySelector('.edition').innerText = 'SE';
      licenseInput.placeholder = 'Paste License Key Here ...';
      btnLicenseActive.style.display = 'inline-block';
      btnLicenseRemove.style.display = 'none';
      restructureGrid(false);
    });
  } else {
    // No electronAPI available, treat as unlicensed
    document.querySelector('.edition').innerText = 'SE';
    btnLicenseActive.style.display = 'inline-block';
    btnLicenseRemove.style.display = 'none';
    restructureGrid(false);
  }
  
}

function initModalReport() {
  const modalSettings = document.querySelector('.modal.settings');
  const modalReport = document.querySelector('.modal.report');
  const btnSettings = document.getElementById('btnSettings');
  const btnReport = document.getElementById('btnReport');
  const btnTask = document.getElementById('btnTask');
  const panelNote = document.getElementById('panelNote');
  const panelsContainer = document.getElementById('panelsContainer');

  const btnDateRangeByYear = document.getElementById('dateRangeByYear');
  const btnDateRangeByMonth = document.getElementById('dateRangeByMonth');
  const btnDateRangeByWeek = document.getElementById('dateRangeByWeek');

  const btnPrevRange = document.getElementById('prevRange');
  const btnNextRange = document.getElementById('nextRange');
  const txtCurrentRange = document.getElementById('currentRange');

  const btnDataCalculateByActivity = document.getElementById('dataCalculateByActivity');
  const btnDataCalculateByQuantity = document.getElementById('dataCalculateByQuantity');

  btnDateRangeByYear.dataset['range'] = moment().year(); // 2024
  btnDateRangeByMonth.dataset['range'] = moment().month(); // 0-11
  btnDateRangeByWeek.dataset['range'] = moment().week(); // 0-53+
  txtCurrentRange.dataset['range'] = moment().week(); // set current week as default

  btnReport.addEventListener('click', () => {
    const activedList = document.querySelector('#areaListLists input.active');
    
    btnSettings.classList.remove('active');
    modalSettings.classList.remove('open');

    if(modalReport.classList.contains('open')) {
      panelNote.classList.remove('showModal');
      modalReport.classList.remove('open');
      activedList.classList.remove('hidden');
      btnReport.classList.remove('active');
      btnTask.classList.add('active');
      panelsContainer.style.gridTemplateColumns = localStorage.getItem('grid-template-columns') || '50px 100px 10px 1fr';
      activedList.click();
    } else {
      if(!modalSettings.classList.contains('open')) {
        btnTask.classList.add('active');
      }
      panelNote.classList.add('showModal');
      modalReport.classList.add('open');
      activedList.classList.add('hidden');
      btnReport.classList.add('active');
      panelsContainer.style.gridTemplateColumns = '50px 0 0 1fr';
    }

    updateTimelineChart(
      'Week',
      txtCurrentRange.dataset['range'],
      document.querySelector('#dataCalculateBy .filterButton.active').dataset.id
    );
    // generateBarChart();
  });

  btnDateRangeByYear.addEventListener('click', () => {
    document.querySelector('#dateRangeBy .filterButton.active').classList.remove('active');
    btnDateRangeByYear.classList.add('active');
    txtCurrentRange.dataset['range'] = btnDateRangeByYear.dataset['range'];
    updateTimelineChart(
      'Year',
      btnDateRangeByYear.dataset['range'],
      document.querySelector('#dataCalculateBy .filterButton.active').dataset.id
    );
  });
  btnDateRangeByMonth.addEventListener('click', () => {
    document.querySelector('#dateRangeBy .filterButton.active').classList.remove('active');
    btnDateRangeByMonth.classList.add('active');
    txtCurrentRange.dataset['range'] = btnDateRangeByMonth.dataset['range'];
    updateTimelineChart(
      'Month',
      btnDateRangeByMonth.dataset['range'],
      document.querySelector('#dataCalculateBy .filterButton.active').dataset.id
    );
  });
  btnDateRangeByWeek.addEventListener('click', () => {
    document.querySelector('#dateRangeBy .filterButton.active').classList.remove('active');
    btnDateRangeByWeek.classList.add('active');
    txtCurrentRange.dataset['range'] = btnDateRangeByWeek.dataset['range'];
    updateTimelineChart(
      'Week',
      btnDateRangeByWeek.dataset['range'],
      document.querySelector('#dataCalculateBy .filterButton.active').dataset.id
    );
  });

  btnPrevRange.addEventListener('click', () => {
    let currentRange = parseInt(txtCurrentRange.dataset['range']) - 1;
    updateTimelineChart(
      document.querySelector('#dateRangeBy .filterButton.active').dataset.id, 
      currentRange,
      document.querySelector('#dataCalculateBy .filterButton.active').dataset.id
    );
    txtCurrentRange.dataset['range'] = currentRange;
  });
  btnNextRange.addEventListener('click', () => {
    let currentRange = parseInt(txtCurrentRange.dataset['range']) + 1;
    updateTimelineChart(
      document.querySelector('#dateRangeBy .filterButton.active').dataset.id, 
      currentRange,
      document.querySelector('#dataCalculateBy .filterButton.active').dataset.id
    );
    txtCurrentRange.dataset['range'] = currentRange;
  });

  btnDataCalculateByActivity.addEventListener('click', () => {
    document.querySelector('#dataCalculateBy .filterButton.active').classList.remove('active');
    btnDataCalculateByActivity.classList.add('active');
    updateTimelineChart(
      document.querySelector('#dateRangeBy .filterButton.active').dataset.id, 
      document.querySelector('#dateRangeBy .filterButton.active').dataset['range'],
      btnDataCalculateByActivity.dataset.id
    );
  });
  btnDataCalculateByQuantity.addEventListener('click', () => {
    document.querySelector('#dataCalculateBy .filterButton.active').classList.remove('active');
    btnDataCalculateByQuantity.classList.add('active');
    updateTimelineChart(
      document.querySelector('#dateRangeBy .filterButton.active').dataset.id, 
      document.querySelector('#dateRangeBy .filterButton.active').dataset['range'],
      btnDataCalculateByQuantity.dataset.id
    );
  });

  initTimelineChart();
}

function initModalTask() {
  const modalSettings = document.querySelector('.modal.settings');
  const modalReport = document.querySelector('.modal.report');
  const btnSettings = document.getElementById('btnSettings');
  const btnReport = document.getElementById('btnReport');
  const btnTask = document.getElementById('btnTask');
  const panelNote = document.getElementById('panelNote');
  const panelsContainer = document.getElementById('panelsContainer');

  btnTask.addEventListener('click', () => {
    
    btnTask.classList.add('active');
    panelNote.classList.remove('showModal');
    btnReport.classList.remove('active');
    btnSettings.classList.remove('active');
    modalReport.classList.remove('open');
    modalSettings.classList.remove('open');

    panelsContainer.style.gridTemplateColumns = localStorage.getItem('grid-template-columns') || '50px 100px 10px 1fr';
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
    const currentGrid = panelsContainer.style.gridTemplateColumns.split(' ');
    const proEdition = document.querySelector('.edition').innerText === 'Pro' ? true : false;
    const rememberedGrid = localStorage.getItem('grid-template-columns') || (proEdition ? '50px 100px 10px 1fr' : '0 100px 10px 1fr');
    const rememberedGridArray = rememberedGrid.split(' ');
    let currentListGrid = currentGrid[1];

    // Update legacy se edition
    if (rememberedGridArray.length === 3) {
      currentListGrid = currentGrid[0];
      rememberedGridArray.unshift('0px');
      localStorage.setItem('grid-template-columns', rememberedGridArray.join(' '));
    }

    // Update legacy pro edition
    if (!proEdition && rememberedGridArray.length === 4 && (currentGrid[0] !== '0px' || currentGrid[0] !== '0')) {
      rememberedGrid[0] = '0px';
    }

    if(currentListGrid == '0px') {
      panelsContainer.style.gridTemplateColumns = rememberedGrid;
      localStorage.setItem('listOpened', true);
    } else {
      panelsContainer.style.gridTemplateColumns = proEdition ? currentGrid[0] + ' 0px 0px 1fr' : '0 0px 0px 1fr';
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

  moment.locale(Languages[rememberedLanguage].locale);
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
  const elementsPlaceholder = document.querySelectorAll('[data-lang-placeholder]');

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
  elementsPlaceholder.forEach(el => {
    el.placeholder = Languages[languageCode][el.dataset['langPlaceholder']] || el.placeholder;
  });
}

function translate(wordsCode) {
  const currentLanguage = localStorage.getItem('language') || 'en';
  return Languages[currentLanguage][wordsCode] || false;
}

function initTimelineChart() {
  let themeColor_Incompleted = getCurrentThemeColor() || '#cfd8dc';
  let themeColor_Completed = getCurrentThemeColor(true) || '#90a4ae';
  if(document.querySelector('.theme-dark')) {
    themeColor_Incompleted = '#607d8b';
    themeColor_Completed = '#cfd8dc';
  }

  const langCode = localStorage.getItem('language') || 'en';
  const label_incomplete = Languages[langCode]['__incompleted__'] || 'Incomplete';
  const label_completed = Languages[langCode]['__completed__'] || 'Completed';

  const ctx = document.getElementById('chart_timeline');
  const data = {
    labels: [],
    datasets: [
      {
        label: label_incomplete,
        data: [],
        backgroundColor: themeColor_Incompleted + '33',
        borderColor: themeColor_Incompleted,
        tension: 0,
        fill: true
      },
      {
        label: label_completed,
        data: [],
        backgroundColor: themeColor_Completed + '33',
        borderColor: themeColor_Completed,
        tension: 0,
        fill: true
      }
    ]
  };

  Zeke_ChartTimeline = new Chart(ctx, {
    type: 'line',
    data: data,
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });

}

function updateTimelineChart(filterBy, dateRange, type) {
  let labels = [];
  let labels_standard = [];
  let data_incompleted = [];
  let data_completed = [];
  let countDays = 0;
  let tableBody = '';
  let currentRangeText = '';

  let compareDate = '';
  let compareDatetime = 0;
  let compareFormat = 'YYYY-MM-DD';

  let countIncomplete = [];
  let countComplete = [];

  if(filterBy === 'Week') {
    countDays = 7;
    currentRangeText = 'W'+ moment().week(dateRange).format('W');
  }
  if(filterBy === 'Month') {
    countDays = moment().month(dateRange).daysInMonth();
    currentRangeText = moment().month(dateRange).format('MMM');
  }
  if(filterBy === 'Year') {
    countDays = 12;
    currentRangeText = moment().year(dateRange).format('YYYY');
  }

  for(let i = 0; i < countDays; i ++) {
    if(filterBy === 'Week') {
      compareDate = moment().week(dateRange).day(i).format('YYYY-MM-DD');
      labels.push(moment(compareDate).format('D, ddd'));
      labels_standard.push(compareDate);
    }
    if(filterBy === 'Month') {
      compareDate = moment().month(dateRange).date(i + 1).format('YYYY-MM-DD');
      labels.push(moment(compareDate).format('MMM D'));
      labels_standard.push(compareDate);
    }
    if(filterBy === 'Year') {
      if(type === 'Activity') {
        compareDate = moment().year(dateRange).month(i).format('YYYY-MM');
        compareFormat = 'YYYY-MM';
      }
      if(type === 'Quantity') {
        compareDate = moment().year(dateRange).month(i).endOf('month').format('YYYY-MM-DD');
      }
      labels.push(moment(compareDate).format('MMM'));
      labels_standard.push(moment().year(dateRange).month(i).format('YYYY-MM'));
    }

    compareDatetime = Date.parse(compareDate + ' 23:59:59');

    if(type === 'Activity') {
      countIncomplete = Zeke.notes.filter(note => moment(note.dateCreated).format(compareFormat) == compareDate);
      countComplete = Zeke.notes.filter(note => moment(note.dateCompleted).format(compareFormat) == compareDate);
    } else {
      countIncomplete = Zeke.notes.filter(note => note.dateCreated < compareDatetime && (note.dateCompleted == '' || note.dateCompleted > compareDatetime));
      countComplete = Zeke.notes.filter(note => note.dateCompleted < compareDatetime);
    }
    
    data_incompleted.push(countIncomplete.length);
    data_completed.push(countComplete.length);

    // update table
    tableBody += `
      <tr>
        <td>${labels_standard[i]}</td>
        <td>${countIncomplete.length}</td>
        <td>${countComplete.length}</td>
        <td>${countComplete.length + countIncomplete.length}</td>
      </tr>
    `;
  }

  Zeke_ChartTimeline.data.labels = labels;
  Zeke_ChartTimeline.data.datasets[0].data = data_incompleted;
  Zeke_ChartTimeline.data.datasets[1].data = data_completed;
  Zeke_ChartTimeline.update();

  document.getElementById('currentRange').innerHTML = currentRangeText;
  // document.getElementById('rangeIndicator').innerHTML = labels_standard[0] + ' ~ ' + labels_standard[labels_standard.length - 1];
  document.querySelector('#chart_datasheet tbody').innerHTML = tableBody;
}

function generateBarChart() {

  //TODO: if cavas already in use, update chart only

  const ctx = document.getElementById('chart_bar');
  const labels = Zeke.lists.map(list => list.name);

  let data_incomplete = [];
  let data_complete = [];

  Zeke.lists.forEach(list => {
    let countIncomplete = Zeke.notes.filter(note => note.list == list.id && note.completed == false).length;
    let countComplete = Zeke.notes.filter(note => note.list == list.id && note.completed == true).length;
    data_incomplete.push(countIncomplete);
    data_complete.push(countComplete);
  });

  const data = {
    axis: 'y',
    labels: labels,
    datasets: [
      {
        label: 'Completed',
        data: data_complete,
        fill: false,
        backgroundColor: '#cccccccc',
        borderColor: '#cccccc',
        borderWidth: 1
      },
      {
        label: 'Incomplete',
        data: data_incomplete,
        fill: false,
        backgroundColor: '#eee',
        borderColor: '#eee',
        borderWidth: 1
      },
    ]
  };

  const chart = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      indexAxis: 'y',
      scales: {
        x: { stacked: true, display: false },
        y: { stacked: true }
      }
    }
  });
}

function applyAutoTheme() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.className = prefersDark ? 'theme-dark' : 'origin-theme-light';
}

function init() {
  const theme = localStorage.getItem('theme') || '';
  const opacity = localStorage.getItem('opacity') || '100';
  const bounds = localStorage.getItem('bounds');

  if (theme === 'theme-auto') {
    applyAutoTheme();
  } else {
    document.body.className = theme;
  }

  document.body.style.opacity = opacity + '%';

  if(!getCurrentThemeColor()) { 
    document.body.className = 'origin-theme-light';
  }

  if(bounds) {
    window.electronAPI.setBounds(JSON.parse(bounds));
  }

  initTitlebar();
  initGrid();
  initModalTask();
  initModalReport();
  initModalSettings();
  initLanguage();
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'theme-auto') {
      applyAutoTheme();
    }
  })
}

init();