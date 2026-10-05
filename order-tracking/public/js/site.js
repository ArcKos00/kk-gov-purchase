// Клік по рядку таблиці відкриває замовлення.
document.addEventListener('click', (e) => {
  const row = e.target.closest('tr.row-link');
  if (!row || e.target.closest('a, button, input, form')) return;
  window.location = row.dataset.href;
});

// Підтвердження для форм видалення.
document.addEventListener('submit', (e) => {
  const message = e.target.dataset.confirm;
  if (message && !window.confirm(message)) e.preventDefault();
});

// "Заповнити все, що очікуємо" на сторінці поставки.
document.addEventListener('click', (e) => {
  if (e.target.id !== 'fill-all') return;
  document.querySelectorAll('.delivery-qty:not([disabled])').forEach((input) => {
    input.value = input.dataset.pending;
  });
});

// Динамічні рядки найменувань у формі договору.
function initItemRows() {
  const body = document.getElementById('items');
  const template = document.getElementById('item-template');

  const renumber = () => {
    body.querySelectorAll('tr.item-row').forEach((row, index) => {
      row.querySelectorAll('[name]').forEach((el) => {
        el.name = el.name.replace(/^items\[(\d+|#)\]/, `items[${index}]`);
      });
    });
  };

  document.getElementById('add-item').addEventListener('click', () => {
    body.appendChild(template.content.cloneNode(true));
    renumber();
    body.querySelector('tr.item-row:last-child input').focus();
  });

  body.addEventListener('click', (e) => {
    const button = e.target.closest('.remove-item');
    if (!button) return;
    button.closest('tr').remove();
    renumber();
  });
}
