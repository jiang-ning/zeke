/**
 * DateTimePicker class
 * Shared datetime picker - attach to #sharedDateTimePicker element.
 * Can be used for reminders, due dates, or any date/time selection.
 * Usage:
 *   const picker = new DateTimePicker(document.getElementById('sharedDateTimePicker'));
 *   picker.show(anchorEl, existingDate, (dateTimeStr) => { console.log(dateTimeStr); });
 */
class DateTimePicker {
  constructor(el) {
    this.el = el;
    this.calendarDate = new Date();
    this.selectedDate = null;
    this.onConfirm = null;
    this.onRemove = null;
    this.onClose = null;
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;

    const prevBtn = this.el.querySelector('.mini-calendar-prev');
    const nextBtn = this.el.querySelector('.mini-calendar-next');
    const confirmBtn = this.el.querySelector('.datetime-picker-actions button:nth-child(2)');
    const cancelBtn = this.el.querySelector('.datetime-picker-actions button:last-child');
    const hourList = this.el.querySelector('.time-list:first-of-type') || this.el.querySelectorAll('.time-list')[0];
    const minuteList = this.el.querySelectorAll('.time-list')[1];

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
      this._renderCalendar();
    });
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.calendarDate.setMonth(this.calendarDate.getMonth() + 1);
      this._renderCalendar();
    });

    // Populate hour list
    for (let h = 0; h < 24; h++) {
      const li = document.createElement('li');
      li.textContent = String(h).padStart(2, '0');
      li.dataset.value = h;
      li.addEventListener('click', () => {
        hourList.querySelector('.selected')?.classList.remove('selected');
        li.classList.add('selected');
      });
      hourList.appendChild(li);
    }
    // Populate minute list (5-min intervals)
    for (let m = 0; m < 60; m += 5) {
      const li = document.createElement('li');
      li.textContent = String(m).padStart(2, '0');
      li.dataset.value = m;
      li.addEventListener('click', () => {
        minuteList.querySelector('.selected')?.classList.remove('selected');
        li.classList.add('selected');
      });
      minuteList.appendChild(li);
    }

    confirmBtn.addEventListener('click', () => {
      const hourEl = hourList.querySelector('.selected');
      const minEl = minuteList.querySelector('.selected');
      const hour = hourEl ? hourEl.dataset.value : '0';
      const minute = minEl ? minEl.dataset.value : '0';
      if (this.selectedDate && this.onConfirm) {
        const dt = this.selectedDate + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
        this.onConfirm(dt);
      }
      this._confirmed = true;
      this.close();
    });

    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    const removeBtn = this.el.querySelector('.datetime-picker-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (this.onRemove) this.onRemove();
        this.close();
      });
    }
  }

  _renderCalendar() {
    const year = this.calendarDate.getFullYear();
    const month = this.calendarDate.getMonth();
    const today = new Date();
    const daysContainer = this.el.querySelector('.mini-calendar-days');
    const titleEl = this.el.querySelector('.mini-calendar-title');
    const weekdaysEl = this.el.querySelector('.mini-calendar-weekdays');

    titleEl.textContent = moment(this.calendarDate).format('MMM YYYY');

    if (weekdaysEl.children.length === 0) {
      moment.weekdaysMin().forEach(d => {
        const span = document.createElement('span');
        span.textContent = d;
        weekdaysEl.appendChild(span);
      });
    }

    daysContainer.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
      const span = document.createElement('span');
      span.textContent = daysInPrevMonth - i;
      span.className = 'other-month';
      daysContainer.appendChild(span);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const span = document.createElement('span');
      span.textContent = d;
      span.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        span.classList.add('today');
      }
      if (this.selectedDate && span.dataset.date === this.selectedDate) {
        span.classList.add('selected');
      }
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        daysContainer.querySelector('.selected')?.classList.remove('selected');
        span.classList.add('selected');
        this.selectedDate = span.dataset.date;
      });
      daysContainer.appendChild(span);
    }

    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      const span = document.createElement('span');
      span.textContent = i;
      span.className = 'other-month';
      daysContainer.appendChild(span);
    }
  }

  _selectCurrentTime() {
    const hourList = this.el.querySelectorAll('.time-list')[0];
    const minuteList = this.el.querySelectorAll('.time-list')[1];
    const nowHour = new Date().getHours();
    const nowMin = Math.round(new Date().getMinutes() / 5) * 5;

    hourList.querySelector('.selected')?.classList.remove('selected');
    minuteList.querySelector('.selected')?.classList.remove('selected');

    if (hourList.children[nowHour]) hourList.children[nowHour].classList.add('selected');
    const minItem = minuteList.querySelector(`li[data-value="${nowMin < 60 ? nowMin : 0}"]`);
    if (minItem) minItem.classList.add('selected');

    setTimeout(() => {
      hourList.querySelector('.selected')?.scrollIntoView({ block: 'center' });
      minuteList.querySelector('.selected')?.scrollIntoView({ block: 'center' });
    }, 0);
  }

  isOpen() {
    return this.el.classList.contains('open');
  }

  open(onConfirm) {
    this._init();
    this.onConfirm = onConfirm || null;
    if (!this.selectedDate) {
      const today = new Date();
      this.selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      this.calendarDate = new Date();
    }
    this._renderCalendar();
    this._selectCurrentTime();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    if (!this._confirmed && this.onClose) this.onClose();
    this._confirmed = false;
  }

  toggle(onConfirm) {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open(onConfirm);
    }
  }

  /**
   * Show the picker anchored to an element, with optional pre-selected date.
   * @param {Element} anchorEl - Element to position the picker near
   * @param {number|null} existingTimestamp - Existing date timestamp to pre-select
   * @param {function} onConfirm - Callback with datetime string when OK is clicked
   * @param {object} [options] - Optional settings
   * @param {string} [options.alignRight] - If true, align picker's right edge to anchor's right edge
   * @param {boolean} [options.hideTime] - If true, hide the hour/minute time selection
   */
  show(anchorEl, existingTimestamp, onConfirm, options = {}) {
    // Show/hide time section
    const timeSection = this.el.querySelector('.datetime-picker-time');
    if (timeSection) timeSection.style.display = options.hideTime ? 'none' : '';

    // Position near the anchor element
    const rect = anchorEl.getBoundingClientRect();
    this.el.style.top = (rect.bottom + window.scrollY) + 'px';
    if (options.alignRight) {
      this.el.style.left = '';
      this.el.style.right = (document.documentElement.clientWidth - rect.right) + 'px';
    } else {
      this.el.style.right = '';
      this.el.style.left = (rect.left + window.scrollX) + 'px';
    }

    // Show/hide remove button based on whether a date already exists
    const removeBtn = this.el.querySelector('.datetime-picker-remove');
    if (removeBtn) {
      removeBtn.style.display = existingTimestamp ? '' : 'none';
    }
    this.onRemove = options.onRemove || null;

    // Pre-select date if provided
    if (existingTimestamp) {
      const existingDate = new Date(existingTimestamp);
      this.selectedDate = `${existingDate.getFullYear()}-${String(existingDate.getMonth() + 1).padStart(2, '0')}-${String(existingDate.getDate()).padStart(2, '0')}`;
      this.calendarDate = new Date(existingDate);
    } else {
      this.selectedDate = null;
    }

    this.open(onConfirm);

    // If the picker overflows the viewpoint bottom, flip it above the anchor
    const pickerRect = this.el.getBoundingClientRect();
    if (pickerRect.bottom > window.innerHeight) {
      this.el.style.top = (rect.top + window.scrollY - this.el.offsetHeight) + 'px';
    }
  }

  getSelectedDateTime() {
    const hourList = this.el.querySelectorAll('.time-list')[0];
    const minuteList = this.el.querySelectorAll('.time-list')[1];
    const hourEl = hourList?.querySelector('.selected');
    const minEl = minuteList?.querySelector('.selected');
    const hour = hourEl ? hourEl.dataset.value : '0';
    const minute = minEl ? minEl.dataset.value : '0';
    if (this.selectedDate) {
      return this.selectedDate + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
    }
    return null;
  }
}

/**
 * Initialize a custom dropdown select component
 * @param {HTMLElement} el - The .custom-select container element
 * @param {string} initialValue - The initial selected value
 */
function initCustomSelect(el, initialValue) {
  const trigger = el.querySelector('.custom-select-trigger');
  const options = el.querySelectorAll('.custom-select-options li');
  const valueDisplay = el.querySelector('.custom-select-value');

  trigger.addEventListener('click', () => {
    el.classList.toggle('open');
  });

  options.forEach(option => {
    option.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      valueDisplay.textContent = option.textContent;
      el.classList.remove('open');
      const event = new CustomEvent('change', { detail: { value: option.dataset.value }});
      el.dispatchEvent(event);
    });
  });

  document.addEventListener('click', (e) => {
    if (!el.contains(e.target)) {
      el.classList.remove('open');
    }
  });

  // Set initial value
  if (initialValue) {
    const initialOption = el.querySelector(`[data-value="${initialValue}"]`);
    if (initialOption) {
      options.forEach(o => o.classList.remove('selected'));
      initialOption.classList.add('selected');
      valueDisplay.textContent = initialOption.textContent;
    }
  }
}

function checkDueDateStatus(el, dueDateStr, completedDateStr) {
  if (!dueDateStr) return '';
  const now = moment();
  const due = moment(dueDateStr);
  const completed = completedDateStr ? moment(completedDateStr) : null;
  el.classList.remove('overDue', 'dueToday', 'dueAhead');
  if (completed) {
    if (due.isBefore(completed, 'day')) {
      el.title = translate('__overdue__') + ' ' + due.format('YYYY-MM-DD');
      el.classList.add('overDue');
      return iconDueDateOverDue;
    } else {
      el.title = translate('__completed_on_time__');
      el.classList.add('dueAhead');
      return iconDueDateAhead;
    }
  } else {
    if (due.isBefore(now, 'day')) {
      el.title = translate('__overdue__') + ' ' + due.format('YYYY-MM-DD');
      el.classList.add('overDue');
      return iconDueDateOverDue;
    } else if (due.isSame(now, 'day')) {
      el.title = translate('__due_today__');
      el.classList.add('dueToday');
      return iconDueDateActive;
    } else {
      return iconDueDateActive;
    }
  }
}

const iconReminder = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9z"/>
  <path d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1zm1.038 3.018a6 6 0 0 1 .924 0 6 6 0 1 1-.924 0M0 3.5c0 .753.333 1.429.86 1.887A8.04 8.04 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5M13.5 1c-.753 0-1.429.333-1.887.86a8.04 8.04 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1"/>
</svg>
`;
const iconReminderActive = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M6 .5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1H9v1.07a7.001 7.001 0 0 1 3.274 12.474l.601.602a.5.5 0 0 1-.707.708l-.746-.746A6.97 6.97 0 0 1 8 16a6.97 6.97 0 0 1-3.422-.892l-.746.746a.5.5 0 0 1-.707-.708l.602-.602A7.001 7.001 0 0 1 7 2.07V1h-.5A.5.5 0 0 1 6 .5m2.5 5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9zM.86 5.387A2.5 2.5 0 1 1 4.387 1.86 8.04 8.04 0 0 0 .86 5.387M11.613 1.86a2.5 2.5 0 1 1 3.527 3.527 8.04 8.04 0 0 0-3.527-3.527"/>
</svg>
`;
const iconDueDate = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"/>
  <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
</svg>
`;
const iconDueDateActive = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M4 .5a.5.5 0 0 0-1 0V1H2a2 2 0 0 0-2 2v1h16V3a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V1H4zM16 14V5H0v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-3.5-7h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5"/>
</svg>
`;
const iconDueDateAhead = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M4 .5a.5.5 0 0 0-1 0V1H2a2 2 0 0 0-2 2v1h16V3a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V1H4zM16 14V5H0v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2m-5.146-5.146-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708L7.5 10.793l2.646-2.647a.5.5 0 0 1 .708.708"/>
</svg>
`;
const iconDueDateOverDue = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M4 .5a.5.5 0 0 0-1 0V1H2a2 2 0 0 0-2 2v1h16V3a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V1H4zM16 14V5H0v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M6.854 8.146 8 9.293l1.146-1.147a.5.5 0 1 1 .708.708L8.707 10l1.147 1.146a.5.5 0 0 1-.708.708L8 10.707l-1.146 1.147a.5.5 0 0 1-.708-.708L7.293 10 6.146 8.854a.5.5 0 1 1 .708-.708"/>
</svg>
`;