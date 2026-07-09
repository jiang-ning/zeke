/**
 * DateTimePicker class
 * Attach to any .reminder-picker element to get an inline calendar + time list picker
 * Usage:
 *   const picker = new DateTimePicker(document.getElementById('myPicker'));
 *   picker.toggle((dateTimeStr) => { console.log(dateTimeStr); });
 */
class DateTimePicker {
  constructor(el) {
    this.el = el;
    this.calendarDate = new Date();
    this.selectedDate = null;
    this.onConfirm = null;
    this.onClose = null;
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;

    const prevBtn = this.el.querySelector('.mini-calendar-prev');
    const nextBtn = this.el.querySelector('.mini-calendar-next');
    const confirmBtn = this.el.querySelector('.reminder-picker-actions button:first-child');
    const cancelBtn = this.el.querySelector('.reminder-picker-actions button:last-child');
    const hourList = this.el.querySelector('.time-list:first-of-type') || this.el.querySelectorAll('.time-list')[0];
    const minuteList = this.el.querySelectorAll('.time-list')[1];

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
      this._renderCalendar();
    });
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.calendarDate.setMonth(this.calendarDate.getMonth + 1);
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
      this.close();
    });

    cancelBtn.addEventListener('click', () => {
      this.close();
    });
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
    if (this.onClose) this.onClose();
  }

  toggle(onConfirm) {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open(onConfirm);
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