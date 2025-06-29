const TELEGRAM_TOKEN = '';
const TELEGRAM_URL   = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN;
const SPREADSHEET_ID = '';

const KB_MAIN = {
  keyboard: [
    ['📚 Mata Kuliah', '📆 Jadwal Kuliah'],
    ['📝 Tugas', '🔔 Pengingat'],
    ['/start']
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

const KB_MATKUL = {
  keyboard: [
    ['➕ Tambah Matakuliah', '📄 Lihat Mata Kuliah'],
    ['🔙 Kembali']
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

const KB_JADWAL = {
  keyboard: [
    ['➕ Tambah Jadwal', '📄 Lihat Jadwal'],
    ['🔙 Kembali']
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

const KB_TUGAS = {
  keyboard: [
    ['➕ Tambah Tugas', '📄 Lihat Tugas'],
    ['🔙 Kembali']
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function setUserState(userId, key, val) {
  PropertiesService.getUserProperties().setProperty(`${userId}_${key}`, val);
}
function getUserState(userId, key) {
  return PropertiesService.getUserProperties().getProperty(`${userId}_${key}`);
}
function clearUserState(userId) {
  const p = PropertiesService.getUserProperties();
  p.deleteProperty(`${userId}_action`);
  p.deleteProperty(`${userId}_edit_id`);
  p.deleteProperty(`${userId}_matkul`);
}

function ensureTriggers() {
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction() + '|' + t.getTriggerSourceId());
  if (!existing.some(e => e.startsWith('runPengingat7'))) {
    ScriptApp.newTrigger('runPengingat7').timeBased().atHour(7).everyDays(1).create();
  }
  if (!existing.some(e => e.startsWith('runPengingat20'))) {
    ScriptApp.newTrigger('runPengingat20').timeBased().atHour(20).everyDays(1).create();
  }
}

function doPost(e) {
  try {
    ensureTriggers();
    const update = JSON.parse(e.postData.contents);

    // ── CALLBACK_QUERY HANDLER DENGAN KONFIRMASI ──
  if (update.callback_query) {
    const cb     = update.callback_query;
    const chatId = cb.message.chat.id;
    const userId = cb.from.id;
    const data   = cb.data;

    // Cancel dari inline-batal Jadwal
  if (data === 'CancelJadwal') {
    UrlFetchApp.fetch(TELEGRAM_URL+'/answerCallbackQuery', {
      method:'post', contentType:'application/json',
      payload: JSON.stringify({ callback_query_id: cb.id })
    });
    clearUserState(userId);
    return sendMessage(chatId, '❌ Operasi jadwal dibatalkan.', false, KB_JADWAL);
  }

  // Cancel dari inline-batal Tugas
  if (data === 'CancelTugas') {
    UrlFetchApp.fetch(TELEGRAM_URL+'/answerCallbackQuery', {
      method:'post', contentType:'application/json',
      payload: JSON.stringify({ callback_query_id: cb.id })
    });
    clearUserState(userId);
    return sendMessage(chatId, '❌ Operasi tugas dibatalkan.', false, KB_TUGAS);
  }

    // 1) Jika initial delete (Jadwal / Tugas)
    if (data.startsWith('HapusJadwal:') || data.startsWith('HapusTugas:')) {
      const [act, id] = data.split(':');
      const label = act === 'HapusJadwal' ? 'Jadwal' : 'Tugas';
      return sendMessage(chatId,
        `⚠️ Yakin ingin *menghapus* ${label} ID ${id}?`,
        true,
        {
          inline_keyboard: [[
            { text: '✅ Ya', callback_data: `Confirm${act}:${id}` },
            { text: '❌ Tidak', callback_data: `Cancel${act}:${id}` }
          ]]
        }
      );
    }

    // Konfirmasi Delete Matakuliah
    if (data.startsWith('ConfirmHapusMatkul:')) {
      const id = data.split(':')[1];
      return hapusMataKuliah(userId, id, chatId);
    }
    if (data.startsWith('CancelHapusMatkul:')) {
      // hilangkan spinner
      UrlFetchApp.fetch(TELEGRAM_URL + '/answerCallbackQuery', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ callback_query_id: cb.id })
      });
      return sendMessage(chatId, '❌ Penghapusan Matakuliah dibatalkan.', false, KB_MATKUL);
    }
    // Confirm / Cancel Jadwal
      if (data.startsWith('ConfirmHapusJadwal:')) {
        const id = data.split(':')[1];
        return hapusJadwal(userId, id, chatId);
      }
      if (data.startsWith('CancelHapusJadwal:')) {
        UrlFetchApp.fetch(TELEGRAM_URL+'/answerCallbackQuery', {
          method:'post', contentType:'application/json',
          payload: JSON.stringify({ callback_query_id: cb.id })
        });
        return sendMessage(chatId, '❌ Hapus Jadwal dibatalkan.', false, KB_JADWAL);
      }

      // Confirm / Cancel Tugas
      if (data.startsWith('ConfirmHapusTugas:')) {
        const id = data.split(':')[1];
        return hapusTugas(userId, id, chatId);
      }
      if (data.startsWith('CancelHapusTugas:')) {
        UrlFetchApp.fetch(TELEGRAM_URL+'/answerCallbackQuery', {
          method:'post', contentType:'application/json',
          payload: JSON.stringify({ callback_query_id: cb.id })
        });
        return sendMessage(chatId, '❌ Hapus Tugas dibatalkan.', false, KB_TUGAS);
      }

    // 4) Cancel delete
    if (text.startsWith('🗑️ HapusMatkul:')) {
      const id = text.split(':')[1].trim();
      return sendMessage(chatId,
        `⚠️ Yakin ingin *menghapus* Mata Kuliah ID ${id}?`,
        true,
        { inline_keyboard: [[
            { text: '✅ Ya', callback_data: `ConfirmHapusMatkul:${id}` },
            { text: '❌ Tidak', callback_data: `CancelHapusMatkul:${id}` }
        ]] }
      );
      }

    // 5) Default: clear spinner
    UrlFetchApp.fetch(TELEGRAM_URL + '/answerCallbackQuery', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ callback_query_id: cb.id })
    });
    return;
  }
    
    const c      = update.message;
    const chatId = c.chat.id;
    const userId = c.from.id;
    let text   = c.text;
    text = text.replace(/^@\S+\s*/, '');

    // Main menu
    if (text === '/start' || text === '🔙 Kembali') {
      clearUserState(userId);
      return sendMainMenu(chatId);
    }
    // juga tangani tombol "Batal" plain
    if (text === 'Batal') {
      const kb = getUserState(userId, 'action')?.includes('jadwal') ? KB_JADWAL
              : getUserState(userId, 'action')?.includes('tugas')  ? KB_TUGAS
              : KB_MAIN;
      clearUserState(userId);
      return sendMessage(chatId, '❌ Operasi dibatalkan.', false, kb);
    }

    if (text === '📚 Mata Kuliah')      return sendMessage(chatId, '*Menu Mata Kuliah*', true, KB_MATKUL);
    if (text === '📆 Jadwal Kuliah')    return sendMessage(chatId, '*Menu Jadwal Kuliah*', true, KB_JADWAL);
    if (text === '📝 Tugas')            return sendMessage(chatId, '*Menu Tugas*', true, KB_TUGAS);
    if (text === '🔔 Pengingat') {
      kirimPengingatSingle(userId, chatId);
      return sendMessage(chatId, '🔔 Pengingat terkirim!', false, KB_MAIN);
    }

    // Tambah & Lihat Matakuliah
    if (text === '➕ Tambah Matakuliah') return sendMessage(chatId, 'Ketik: `Matkul: Nama Mata Kuliah`', true, KB_MATKUL);
    if (text.startsWith('Matkul:'))      return tambahMataKuliah(userId, chatId, text.split(':')[1].trim());
    if (text === '📄 Lihat Mata Kuliah') return viewMataKuliah(userId, chatId);

    // Hapus & Edit Matakuliah
    // ── Konfirmasi Hapus Matakuliah via inline ──
    if (text.startsWith('🗑️ HapusMatkul:')) {
      const id = text.split(':')[1].trim();
      return sendMessage(chatId,
        `⚠️ Yakin ingin *menghapus* Mata Kuliah ID ${id}?`,
        true,
        {
          inline_keyboard: [[
            { text: '✅ Ya', callback_data: `ConfirmHapusMatkul:${id}` },
            { text: '❌ Tidak', callback_data: `CancelHapusMatkul:${id}` }
          ]]
        }
      );
    }

    if (text.startsWith('✏️ EditMatkul:')) {
      const id = text.split(':')[1].trim();
      setUserState(userId, 'action', 'edit_matkul');
      setUserState(userId, 'edit_id', id);
      return sendMessage(chatId, `Ketik nama baru untuk Mata Kuliah ID *${id}* lalu kirim.`, true);
    }
    let action = getUserState(userId, 'action');
    if (action === 'edit_matkul') {
      const id = getUserState(userId, 'edit_id');
      clearUserState(userId);
      return editMataKuliah(userId, id, text.trim(), chatId);
    }

    // Tambah Jadwal
    if (text === '➕ Tambah Jadwal') {
      setUserState(userId, 'action', 'add_jadwal');
      const data = getSheet('MataKuliah').getDataRange().getValues().slice(1)
                      .filter(r => String(r[0]) === String(userId));
      const kb = { keyboard: [], resize_keyboard: true, one_time_keyboard: true };
      data.forEach(r => kb.keyboard.push([`MatkulPilihan:${r[1]}|${r[2]}`]));
      kb.keyboard.push(['❌ Batal']);
      return sendMessage(chatId, 'Pilih Mata Kuliah:', false, kb);
    }
    if (action === 'add_jadwal' && text.startsWith('MatkulPilihan:')) {
      const [, p] = text.split(':');
      const [mid, mn] = p.split('|');
      setUserState(userId, 'matkul', mid);
      return sendMessage(chatId,
        `Mata Kuliah *${mn}* dipilih.\nSekarang kirim detail:\n` +
        '`Hari|Jam|Ruang`',
        true, KB_JADWAL
      );
    }
    const pickedJ = getUserState(userId, 'matkul');
    if (action==='add_jadwal' && pickedJ && text.includes('|')) {
      const [hRaw, jRaw, rRaw] = text.split('|').map(s => s.trim());
      const validDays = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
      if (!validDays.includes(hRaw)) {
        return sendMessage(chatId, '❌ Nama hari tidak valid. Gunakan salah satu:\n' + validDays.map(h=>`– ${h}`).join('\n'), false, KB_JADWAL);
      }
      if (!/^[0-2]\d:[0-5]\d$/.test(jRaw)) {
        return sendMessage(chatId, '❌ Format jam tidak valid. Gunakan `HH:mm`.', false, KB_JADWAL);
      }
      tambahJadwal(userId, chatId, pickedJ, hRaw, jRaw, rRaw);
      clearUserState(userId);
      return;
    }
    // ── STEP 1: Tampilkan daftar dan tombol angka ──
    if (text === '📄 Lihat Jadwal') {
      // ambil semua jadwal user
      const rows = getSheet('JadwalKuliah')
        .getDataRange().getDisplayValues().slice(1)
        .filter(r => String(r[0]) === String(userId));
      if (!rows.length) {
        return sendMessage(chatId, '📋 Daftar Jadwal kosong.', false, KB_JADWAL);
      }

      // bangun teks daftar
      let msg = '*Daftar Jadwal:*\n';
      rows.forEach((r, i) => {
      const namaMat = getSheet('MataKuliah')
        .getDataRange().getValues().slice(1)
        .find(m=>String(m[0])===String(userId)&&String(m[1])===r[2])?.[2]||'-';
      const hari  = r[3];
      const jam   = r[4];
      const ruang = r[5];
      msg += `${i+1}) ${namaMat}\n`;
      msg += `   • Hari  : ${hari}\n`;
      msg += `   • Jam   : ${jam}\n`;
      msg += `   • Ruang : ${ruang}\n\n`;
    });


      // reply keyboard angka 1…n + Kembali
      const kb = { keyboard: [], resize_keyboard: true, one_time_keyboard: true };
      rows.forEach((_,i)=> kb.keyboard.push([String(i+1)]));
      kb.keyboard.push(['🔙 Batal']);

      // simpan state
      setUserState(userId, 'action', 'select_jadwal');

      return sendMessage(chatId, msg + '\nPilih nomor untuk Hapus/Edit:', true, kb);
    }
    // ── STEP 2: User pilih nomor jadwal ──
    if (action === 'select_jadwal') {
      // batal via inline
      if (text === '🔙 Batal') {
        clearUserState(userId);
        return sendMessage(chatId, 'Operasi dibatalkan.', false, KB_JADWAL);
      }
      const idx = parseInt(text,10) - 1;
      const rows = getSheet('JadwalKuliah').getDataRange().getDisplayValues().slice(1)
        .filter(r => String(r[0]) === String(userId));
      if (isNaN(idx) || idx < 0 || idx >= rows.length) {
        return sendMessage(chatId, '❌ Pilihan tidak valid.', false, KB_JADWAL);
      }

      const row = rows[idx];
      const id  = row[1];
      setUserState(userId, 'selected_jadwal', id);
      setUserState(userId, 'action', 'jadwal_action');

      // siapkan detail
      const namaMat = getSheet('MataKuliah').getDataRange().getValues().slice(1)
        .find(m=>String(m[0])===String(userId)&&String(m[1])===String(row[2]))?.[2]||'-';
      const detail = `*Jadwal #${idx+1}*\n` +
                    `Mata Kuliah: ${namaMat}\n` +
                    `Hari       : ${row[3]}\n` +
                    `Jam        : ${row[4]}\n` +
                    `Ruang      : ${row[5]}`;

      // inline tombol Hapus/Edit/Batal
      return sendMessage(chatId, detail, false, {
        inline_keyboard: [
          [
            { text: '🗑️ Hapus', callback_data: `ConfirmHapusJadwal:${id}` },
            { text: '✏️ Edit', switch_inline_query_current_chat:
                `EditJadwal:${id}|${row[3]}|${row[4]}|${row[5]}` }
          ],
          [
            { text: '🔙 Batal', callback_data: 'CancelJadwal' }
          ]
        ]
      });
    }

    // ── STEP 3: User pilih Aksi Jadwal ──
    // Hapus & Edit Jadwal
    if (text.startsWith('EditJadwal:')) {
        clearUserState(userId);
  // regex mengabaikan @username (karena sudah di-strip)
    const m = text.match(/^EditJadwal:(\d+)\|([^|]+)\|([^|]+)\|(.+)$/);
    if (!m) {
      return sendMessage(
        chatId,
        '❌ Format salah!\nGunakan: EditJadwal:<ID>|<Hari>|<HH:mm>|<Ruang>',
        false,
        KB_JADWAL
      );
    }
    let [, id, hari, jam, ruang] = m.map(s => s.trim());

    // validasi hari
    const validDays = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    if (!validDays.includes(hari)) {
      return sendMessage(
        chatId,
        '❌ Hari tidak valid. Pilih salah satu: ' + validDays.join(', '),
        false,
        KB_JADWAL
      );
    }

    // validasi jam HH:mm
    if (!/^[0-2]\d:[0-5]\d$/.test(jam)) {
      return sendMessage(
        chatId,
        '❌ Format jam salah. Gunakan `HH:mm` (misal 08:30).',
        false,
        KB_JADWAL
      );
    }

    // jalankan update
    return editJadwal(userId, id, hari, jam, ruang, chatId);
  }
    if (action === 'jadwal_action') {
  const id = getUserState(userId, 'selected_jadwal');
  // ambil data baris utk detail
  const row = getSheet('JadwalKuliah')
    .getDataRange().getDisplayValues().slice(1)
    .find(r => String(r[0])===String(userId)&&String(r[1])===String(id));
  const namaMat = getSheet('MataKuliah')
    .getDataRange().getValues().slice(1)
    .find(m=>String(m[0])===String(userId)&&String(m[1])===row[2])?.[2]||'-';
  const detail =
    `*Jadwal #${id}*\nMata Kuliah: ${namaMat}\n` +
    `Hari       : ${row[3]}\nJam        : ${row[4]}\nRuang      : ${row[5]}`;

  // kirim DETAIL + INLINE tombol Hapus/Edit/Batal
  return sendMessage(chatId, detail, false, {
    inline_keyboard: [
      [
        { text: '🗑️ Hapus', callback_data: `ConfirmHapusJadwal:${id}` },
        { text: '✏️ Edit', switch_inline_query_current_chat:
            `EditJadwal:${id}|${row[3]}|${row[4]}|${row[5]}` }
      ],
      [
        { text: '🔙 Batal', callback_data: `CancelJadwal` }
      ]
    ]
    });
  }

    // Tambah Tugas
    if (text === '➕ Tambah Tugas') {
      setUserState(userId, 'action', 'add_tugas');
      const data = getSheet('MataKuliah').getDataRange().getValues().slice(1)
                      .filter(r => String(r[0]) === String(userId));
      const kb = { keyboard: [], resize_keyboard: true, one_time_keyboard: true };
      data.forEach(r => kb.keyboard.push([`MatkulPilihanTugas:${r[1]}|${r[2]}`]));
      kb.keyboard.push(['❌ Batal']);
      return sendMessage(chatId, 'Pilih Mata Kuliah untuk tugas:', false, kb);
    }
    if (action==='add_tugas' && text.startsWith('MatkulPilihanTugas:')) {
      const [, p] = text.split(':');
      const [mid, mn] = p.split('|');
      setUserState(userId, 'matkul', mid);
      return sendMessage(chatId,
        `Mata Kuliah *${mn}* dipilih.\nSekarang kirim detail:\n` +
        '`NamaTugas|yyyy-MM-dd HH:mm|Keterangan`',
        true, KB_TUGAS
      );
    }
    const pickedT = getUserState(userId, 'matkul');
    if (action==='add_tugas' && pickedT && text.includes('|')) {
      const [nama, deadline, ket] = text.split('|').map(s=>s.trim());
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline) || isNaN(new Date(deadline).getTime())) {
        return sendMessage(chatId, '❌ Format tanggal salah. Gunakan `YYYY-MM-DD HH:mm`.', false, KB_TUGAS);
      }
      tambahTugas(userId, chatId, pickedT, nama, deadline, ket);
      clearUserState(userId);
      return;
    }
    // ── WIZARD TUGAS: STEP 1 ──
    if (text === '📄 Lihat Tugas') {
      const rows = getSheet('Tugas').getDataRange().getValues().slice(1)
        .filter(r => String(r[0]) === String(userId));
      if (!rows.length) {
        return sendMessage(chatId, '📋 Daftar Tugas kosong.', false, KB_TUGAS);
      }

      // build list with numbers
      let msg = '*Daftar Tugas:*\n';
      const matkulRows = getSheet('MataKuliah').getDataRange().getValues().slice(1);
      rows.forEach((r, i) => {
      const matkulRows = getSheet('MataKuliah').getDataRange().getValues().slice(1);
      const namaMat = (matkulRows.find(m =>
        String(m[0])===String(userId)&&String(m[1])===String(r[2])
      )||[])[2]|| '-';
      const namaT    = r[3];
      const deadline = (r[4] instanceof Date)
        ? Utilities.formatDate(r[4], 'Asia/Makassar','yyyy-MM-dd HH:mm')
        : r[4];
      const ket      = r[5];
      msg += `${i+1}) ${namaMat}\n`;
      msg += `   • Tugas    : ${namaT}\n`;
      msg += `   • Deadline : ${deadline}\n`;
      msg += `   • Keterangan: ${ket}\n\n`;
    });


      // reply keyboard: [1], [2], … + Batal
      const kb = {
        keyboard: rows.map((_,i) => [String(i+1)]).concat([['🔙 Batal']]),
        resize_keyboard: true,
        one_time_keyboard: true
      };
      setUserState(userId, 'action', 'select_tugas');
      return sendMessage(chatId, msg + '\nPilih nomor untuk Hapus/Edit:', true, kb);
    }

    // ── WIZARD TUGAS: STEP 2 ──
    if (action === 'select_tugas') {
      if (text === '🔙 Batal') {
        clearUserState(userId);
        return sendMessage(chatId, 'Operasi dibatalkan.', false, KB_TUGAS);
      }
      const idx = parseInt(text,10) - 1;
      const rows = getSheet('Tugas').getDataRange().getValues().slice(1)
        .filter(r => String(r[0]) === String(userId));
      if (isNaN(idx) || idx < 0 || idx >= rows.length) {
        return sendMessage(chatId, '❌ Pilihan tidak valid.', false, KB_TUGAS);
      }

      const row = rows[idx];
      const id  = row[1];
      setUserState(userId, 'selected_tugas', id);
      setUserState(userId, 'action', 'tugas_action');

      // siapkan detail
      const matkulRows = getSheet('MataKuliah').getDataRange().getValues().slice(1);
      const namaMat = (matkulRows.find(m =>
        String(m[0])===String(userId)&&String(m[1])===String(row[2])
      )||[])[2]||'-';
      const deadline = (row[4] instanceof Date)
        ? Utilities.formatDate(row[4],'Asia/Makassar','yyyy-MM-dd HH:mm')
        : row[4];
      const detail = `*Tugas #${idx+1}*\n` +
                    `Mata Kuliah : ${namaMat}\n` +
                    `Nama Tugas  : ${row[3]}\n` +
                    `Deadline     : ${deadline}\n` +
                    `Keterangan  : ${row[5]}`;

      // inline tombol Hapus/Edit/Batal
      return sendMessage(chatId, detail, false, {
        inline_keyboard: [
          [
            { text: '🗑️ Hapus', callback_data: `ConfirmHapusTugas:${id}` },
            { text: '✏️ Edit', switch_inline_query_current_chat:
                `EditTugas:${id}|${row[3]}|${deadline}|${row[5]}` }
          ],
          [
            { text: '🔙 Batal', callback_data: 'CancelTugas' }
          ]
        ]
      });
    }

    // Hapus & Edit Tugas
    // ── Edit Tugas via inline prefill ──
  if (text.startsWith('EditTugas:')) {
    clearUserState(userId)
  // match EditTugas:<id>|<nama>|<deadline>|<ket>
  const m = text.match(/^EditTugas:(\d+)\|([^|]+)\|([^|]+)\|(.+)$/);
  if (!m) {
    return sendMessage(
      chatId,
      '❌ Format salah!\nGunakan: EditTugas:<ID>|<NamaTugas>|<YYYY-MM-DD HH:mm>|<Keterangan>',
      false,
      KB_TUGAS
    );
  }
  let [, id, nama, deadline, ket] = m.map(s => s.trim());

  // 1) Validasi tanggal+jam
  if (
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline) ||
    isNaN(new Date(deadline).getTime())
  ) {
    return sendMessage(
      chatId,
      '❌ Format tanggal salah.\nGunakan `YYYY-MM-DD HH:mm`',
      false,
      KB_TUGAS
    );
  }

  // 2) Ambil matkulId dari sheet (karena payload tidak menyertakannya)
  const row = getSheet('Tugas')
    .getDataRange().getValues().slice(1)
    .find(r => String(r[0])===String(userId) && String(r[1])===id);
  if (!row) {
    return sendMessage(chatId, '❌ ID Tugas tidak ditemukan.', false, KB_TUGAS);
  }
  const matkulId = row[2];

  // 3) Jalankan edit
  return editTugas(userId, id, matkulId, nama, deadline, ket, chatId);}

    sendMessage(chatId, 'Perintah tidak dikenali. Ketik /start untuk kembali.', true, KB_MAIN);

  } catch (e) {
    Logger.log(e);
  }
    // ── WIZARD TUGAS: STEP 3 ──
    // ── STEP 3: User pilih Aksi Tugas ──
    if (action === 'tugas_action') {
    const id = getUserState(userId, 'selected_tugas');
    const row = getSheet('Tugas').getDataRange().getValues().slice(1)
      .find(r=>String(r[0])===String(userId)&&String(r[1])===String(id));
    const matkulRows = getSheet('MataKuliah').getDataRange().getValues().slice(1);
    const namaMat = (matkulRows.find(m=>
      String(m[0])===String(userId)&&String(m[1])===String(row[2])
    )||[])[2]||'-';
    const detail =
      `*Tugas #${id}*\nMata Kuliah : ${namaMat}\n` +
      `Nama Tugas  : ${row[3]}\n` +
      `Deadline     : ${Utilities.formatDate(new Date(row[4]), 'Asia/Makassar','yyyy-MM-dd HH:mm')}\n` +
      `Keterangan  : ${row[5]}`;

    return sendMessage(chatId, detail, false, {
      inline_keyboard: [
        [
          { text: '🗑️ Hapus', callback_data: `ConfirmHapusTugas:${id}` },
          { text: '✏️ Edit', switch_inline_query_current_chat:
              `EditTugas:${id}|${row[3]}|${Utilities.formatDate(new Date(row[4]), 'Asia/Makassar','yyyy-MM-dd HH:mm')}|${row[5]}` }
        ],
        [
          { text: '🔙 Batal', callback_data: `CancelTugas` }
        ]
      ]
      });
    }

}

// Helper & CRUD functions
function sendMainMenu(chatId) {
  const teks = 
    '✨ Selamat datang, Master of Time!\n' +
    'Di sini, semua deadline dan jadwal tertata rapi—tanpa drama.\n\n' +
    '🔧 Dikembangkan oleh Majeri';
  sendMessage(chatId, teks, false, KB_MAIN);
}

function sendMessage(chatId, text, md=false, kb=null) {
  const p = { chat_id: chatId, text };
  if (md) p.parse_mode = 'Markdown';
  if (kb) p.reply_markup = JSON.stringify(kb);
  UrlFetchApp.fetch(TELEGRAM_URL + '/sendMessage', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(p)
  });
}

// Mata Kuliah
function tambahMataKuliah(userId, chatId, namaMatkul) {
  const s = getSheet('MataKuliah');
  const rows = s.getDataRange().getValues().slice(1).filter(r => String(r[0]) === String(userId));
  const maxId = rows.reduce((m,r) => Math.max(m, Number(r[1])), 0);
  const id = maxId + 1;
  s.appendRow([userId, id, namaMatkul]);
  sendMessage(chatId, `✅ Matakuliah ditambahkan (ID ${id}).`, false, KB_MATKUL);
}

function editMataKuliah(userId, id, nama, chatId) {
  const s = getSheet('MataKuliah'), d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][1]) === id && String(d[i][0]) === String(userId)) {
      s.getRange(i+1,3).setValue(nama);
      return sendMessage(chatId, `✅ Matakuliah ${id} diubah.`, false, KB_MATKUL);
    }
  }
  sendMessage(chatId, '❌ ID tidak ditemukan.', false, KB_MATKUL);
}

function hapusMataKuliah(userId, id, chatId) {
  const s = getSheet('MataKuliah'), d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][1]) === id && String(d[i][0]) === String(userId)) {
      s.deleteRow(i+1);
      return sendMessage(chatId, `✅ Matakuliah ${id} dihapus.`, false, KB_MATKUL);
    }
  }
  sendMessage(chatId, '❌ ID tidak ditemukan.', false, KB_MATKUL);
}

function viewMataKuliah(userId, chatId) {
  const all = getSheet('MataKuliah').getDataRange().getValues().slice(1)
    .filter(r => String(r[0]) === String(userId));
  if (!all.length) return sendMessage(chatId, '📋 Daftar kosong.', false, KB_MATKUL);

  let msg = '*Daftar Mata Kuliah:*\n';
  all.forEach(r => msg += `• [\`${r[1]}\`] ${r[2]}\n`);

  const kb = { keyboard: [], resize_keyboard: true, one_time_keyboard: true };
  all.forEach(r => kb.keyboard.push([`🗑️ HapusMatkul:${r[1]}`, `✏️ EditMatkul:${r[1]}`]));
  kb.keyboard.push(['🔙 Kembali']);

  sendMessage(chatId, msg + '\nPilih ID untuk *Hapus* atau *Edit*:', true, kb);
}

// Jadwal
function tambahJadwal(userId, chatId, matkulId, hari, jam, ruang) {
  const s = getSheet('JadwalKuliah');
  const rows = s.getDataRange().getValues().slice(1).filter(r => String(r[0]) === String(userId));
  const maxId = rows.reduce((m,r) => Math.max(m, Number(r[1])), 0);
  const id = maxId + 1;
  s.appendRow([userId, id, matkulId, hari, jam, ruang]);
  sendMessage(chatId, `✅ Jadwal ditambahkan (ID ${id}).`, false, KB_JADWAL);
}

function editJadwal(userId, id, hari, jam, ruang, chatId) {
  const s = getSheet('JadwalKuliah'), d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][1]) === id && String(d[i][0]) === String(userId)) {
      s.getRange(i+1,4,1,3).setValues([[hari,jam,ruang]]);
      return sendMessage(chatId, `✅ Jadwal ${id} diperbarui.`, false, KB_JADWAL);
    }
  }
  sendMessage(chatId, '❌ ID tidak ditemukan.', false, KB_JADWAL);
}

function hapusJadwal(userId, id, chatId) {
  const s = getSheet('JadwalKuliah'), d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][1]) === id && String(d[i][0]) === String(userId)) {
      s.deleteRow(i+1);
      return sendMessage(chatId, `✅ Jadwal ${id} dihapus.`, false, KB_JADWAL);
    }
  }
  sendMessage(chatId, '❌ ID tidak ditemukan.', false, KB_JADWAL);
}

function viewJadwalKuliah(userId, chatId) {
  const rows = getSheet('JadwalKuliah')
    .getDataRange().getDisplayValues().slice(1)
    .filter(r => String(r[0]) === String(userId));
  if (!rows.length) {
    return sendMessage(chatId, '📋 Daftar kosong.', false, KB_JADWAL);
  }

  const matkulRows = getSheet('MataKuliah')
    .getDataRange().getValues().slice(1);

  let msg = '*📅 Daftar Jadwal Kuliah:*\n\n';
  rows.forEach((r, i) => {
    const matkulId = r[2];
    const namaMat  = (matkulRows.find(m => String(m[0]) === String(userId) && String(m[1]) === matkulId) || [])[2] || '-';
    const hari     = r[3] || '-';
    const jam      = r[4] || '-';
    const ruang    = r[5] || '-';

    msg += `${i+1}) ${namaMat}\n`;
    msg += `   • Hari : ${hari}\n`;
    msg += `   • Jam  : ${jam}\n`;
    msg += `   • Ruang: ${ruang}\n\n`;
  });

  const inlineKb = rows.map(r => [
    {
      text: `🗑️ Hapus ${r[1]}`,
      callback_data: `HapusJadwal:${r[1]}`
    },
    {
      text: `✏️ Edit ${r[1]}`,
      switch_inline_query_current_chat: 
        `EditJadwal:${r[1]}|${r[3]}|${r[4]}|${r[5]}`
    }
  ]);

  return sendMessage(
    chatId,
    msg.trim(),
    false,
    KB_JADWAL
  );
}



// Tugas
function tambahTugas(userId, chatId, matkulId, namaTugas, deadline, ket) {
  const s = getSheet('Tugas');
  const rows = s.getDataRange().getValues().slice(1).filter(r => String(r[0]) === String(userId));
  const maxId = rows.reduce((m,r) => Math.max(m, Number(r[1])), 0);
  const id = maxId + 1;
  s.appendRow([userId, id, matkulId, namaTugas, deadline, ket]);
  sendMessage(chatId, `✅ Tugas ditambahkan (ID ${id}).`, false, KB_TUGAS);
}

function editTugas(userId, id, matkulId, namaTugas, deadline, ket, chatId) {
  const s = getSheet('Tugas'), d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][1]) === id && String(d[i][0]) === String(userId)) {
      s.getRange(i+1,3,1,4).setValues([[matkulId, namaTugas, deadline, ket]]);
      return sendMessage(chatId, `✅ Tugas ${id} diubah.`, false, KB_TUGAS);
    }
  }
  sendMessage(chatId, '❌ ID tidak ditemukan.', false, KB_TUGAS);
}

function hapusTugas(userId, id, chatId) {
  const s = getSheet('Tugas'), d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][1]) === id && String(d[i][0]) === String(userId)) {
      s.deleteRow(i+1);
      return sendMessage(chatId, `✅ Tugas ${id} dihapus.`, false, KB_TUGAS);
    }
  }
  sendMessage(chatId, '❌ ID tidak ditemukan.', false, KB_TUGAS);
}

function viewTugas(userId, chatId) {
  const tugasData = getSheet('Tugas')
    .getDataRange().getValues().slice(1)
    .filter(r => String(r[0]) === String(userId));

  if (!tugasData.length) {
    return sendMessage(chatId, '📋 Daftar kosong.', false, KB_TUGAS);
  }

  const matkulRows = getSheet('MataKuliah')
    .getDataRange().getValues().slice(1);

  let msg = '*📄 Daftar Tugas:*\n\n';
  tugasData.forEach((r, i) => {
    const id       = r[1];
    const matkulId = String(r[2]);
    const namaMat  = (matkulRows.find(m => String(m[0]) === String(userId) && String(m[1]) === matkulId) || [])[2] || '-';
    const namaT    = r[3] || '-';
    const deadline = (r[4] instanceof Date)
      ? Utilities.formatDate(r[4], 'Asia/Makassar', 'dd MMM yyyy HH:mm')
      : r[4] || '-';
    const ket      = r[5] || '-';

    msg += `${i+1}) ${namaMat}\n`;
    msg += `   • Tugas    : ${namaT}\n`;
    msg += `   • Deadline : ${deadline}\n`;
    msg += `   • Keterangan: ${ket}\n\n`;
  });

  const inlineKb = tugasData.map(r => [
    {
      text: `🗑️ Hapus ${r[1]}`,
      callback_data: `HapusTugas:${r[1]}`
    },
    {
      text: `✏️ Edit ${r[1]}`,
      switch_inline_query_current_chat:
        `EditTugas:${r[1]}|${r[3]}|${Utilities.formatDate(
           new Date(r[4]), 'Asia/Makassar','yyyy-MM-dd HH:mm'
         )}|${r[5]}`
    }
  ]);

  return sendMessage(
    chatId,
    msg.trim(),
    false,
    KB_TUGAS
  );
}


function runPengingat7()  { runPengingatAll(); }
function runPengingat20() { runPengingatAll(); }
function kirimPengingatSingle(userId, chatId) {
  runPengingatAll();
}

function runPengingatAll() {
  const hariMap  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const bulanMap = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const now = new Date();
  const todayIdx    = now.getDay();
  const tomorrowIdx = (todayIdx + 1) % 7;
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  const fmtToday = Utilities.formatDate(now, 'Asia/Makassar', 'yyyy-MM-dd');
  const fmtTmrw  = Utilities.formatDate(new Date(now.getTime() + 86400000), 'Asia/Makassar', 'yyyy-MM-dd');
  // == Tambahan untuk 3 hari ke depan ==
  const fmt3     = Utilities.formatDate(new Date(now.getTime() + 3 * 86400000), 'Asia/Makassar', 'yyyy-MM-dd');

  const tugasData   = getSheet('Tugas').getDataRange().getValues().slice(1);
  const jadwalData  = getSheet('JadwalKuliah').getDataRange().getDisplayValues().slice(1);
  const mataKulData = getSheet('MataKuliah').getDataRange().getValues().slice(1);

  const chatIds = Array.from(new Set(
    tugasData.map(r => String(r[0]))
    .concat(jadwalData.map(r => String(r[0])))
    .concat(mataKulData.map(r => String(r[0])))
  ));

  chatIds.forEach(chatId => {
    // Tugas arrays (ditambah dueIn3)
    const overDue  = [], dueToday = [], dueTmrw = [], dueIn3 = [];
    // Jadwal arrays
    const jadwalToday = [], jadwalTmrwArr = [];

    // Proses Tugas
    tugasData
      .filter(r => String(r[0]) === chatId)
      .forEach(r => {
        const dlDate = (r[4] instanceof Date) ? r[4] : new Date(r[4]);
        const ds     = Utilities.formatDate(dlDate, 'Asia/Makassar', 'yyyy-MM-dd');
        const dlStr  = Utilities.formatDate(dlDate, 'Asia/Makassar', 'yyyy-MM-dd HH:mm');
        const matName = (mataKulData
          .filter(m => String(m[0]) === chatId)
          .find(m => String(m[1]) === String(r[2])) || [])[2] || '-';
        const item = { matkul: matName, namaTugas: r[3], deadline: dlStr, ket: r[5] };

        if (ds < fmtToday)         overDue.push(item);
        else if (ds === fmtToday)  dueToday.push(item);
        else if (ds === fmtTmrw)   dueTmrw.push(item);
        else if (ds === fmt3)      dueIn3.push(item);  // TENGGAT 3 HARI LAGI
      });

    // Proses Jadwal
    jadwalData
      .filter(r => String(r[0]) === chatId)
      .forEach(r => {
        const hariCell = r[3];
        const jamStr   = (r[4].match(/(\d{1,2}:\d{2})/)||[])[1] || '00:00';
        const ruang    = r[5].trim() || '-';
        const matName  = (mataKulData
          .filter(m => String(m[0]) === chatId)
          .find(m => String(m[1]) === String(r[2])) || [])[2] || '-';
        const item = { nama: matName, hari: hariCell, jam: jamStr, ruang: ruang };

        if (hariCell === hariMap[todayIdx] && jamStr > currentTime) {
          jadwalToday.push(item);
        } else if (hariCell === hariMap[tomorrowIdx]) {
          jadwalTmrwArr.push(item);
        }
      });

    // Bangun pesan
    let msg = `*🔔 PENGINGAT OTOMATIS (${hariMap[todayIdx]} & ${hariMap[tomorrowIdx]})*\n\n`;

    // Format tugas terlewat / hari ini / besok
    if (overDue.length) {
      msg += '*➽ DEADLINE TUGAS TERLEWAT*\n';
      overDue.forEach((e, i) => {
        msg += `${i+1}) ${e.matkul}: ${e.namaTugas}\n`;
        msg += `   • Deadline : ${e.deadline}\n`;
        msg += `   • Keterangan: ${e.ket}\n\n`;
      });
    }
    if (dueToday.length) {
      msg += '*➽ DEADLINE TUGAS HARI INI*\n';
      dueToday.forEach((e, i) => {
        msg += `${i+1}) ${e.matkul}: ${e.namaTugas}\n`;
        msg += `   • Deadline : ${e.deadline}\n`;
        msg += `   • Keterangan: ${e.ket}\n\n`;
      });
    }
    if (dueTmrw.length) {
      msg += '*➽ DEADLINE TUGAS BESOK*\n';
      dueTmrw.forEach((e, i) => {
        msg += `${i+1}) ${e.matkul}: ${e.namaTugas}\n`;
        msg += `   • Deadline : ${e.deadline}\n`;
        msg += `   • Keterangan: ${e.ket}\n\n`;
      });
    }
    // == Tambahan blok 3 hari lagi ==
    if (dueIn3.length) {
      msg += '*➽ DEADLINE TUGAS 3 HARI KEDEPAN*\n';
      dueIn3.forEach((e, i) => {
        msg += `${i+1}) ${e.matkul}: ${e.namaTugas}\n`;
        msg += `   • Deadline : ${e.deadline}\n`;
        msg += `   • Keterangan: ${e.ket}\n\n`;
      });
    }
    // Jika tidak ada tugas dalam kategori manapun
    if (!overDue.length && !dueToday.length && !dueTmrw.length && !dueIn3.length) {
      msg += '❕ Tidak ada tugas deadline terlewat, hari ini, besok, maupun 3 hari lagi.\n\n';
    }

    // Format Jadwal hari ini / besok (tetap seperti semula)
    if (jadwalToday.length) {
      msg += '📄 *Daftar Perkuliahan Hari ini*\n\n';
      jadwalToday.forEach((e, i) => {
        msg += `${i+1}) ${e.nama}\n`;
        msg += `   • Hari  : ${e.hari}\n`;
        msg += `   • Jam   : ${e.jam}\n`;
        msg += `   • Ruang : ${e.ruang}\n\n`;
      });
    } else {
      msg += '❕ Tidak ada perkuliahan hari ini\n\n';
    }
    if (jadwalTmrwArr.length) {
      msg += '📄 *Daftar Perkuliahan Besok*\n\n';
      jadwalTmrwArr.forEach((e, i) => {
        msg += `${i+1}) ${e.nama}\n`;
        msg += `   • Hari  : ${e.hari}\n`;
        msg += `   • Jam   : ${e.jam}\n`;
        msg += `   • Ruang : ${e.ruang}\n\n`;
      });
    }

    // Kirim pesan ke masing-masing chatId
    sendMessage(chatId, msg.trim(), true, KB_MAIN);
  });
}