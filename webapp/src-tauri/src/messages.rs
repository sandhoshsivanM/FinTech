//! Bank SMS from the Mac's Messages database.
//!
//! With Text Message Forwarding on, an iPhone copies every SMS it receives into
//! `~/Library/Messages/chat.db` on the Mac. iOS gives no app a way to read SMS,
//! so this is the only automatic route from an iPhone's bank alerts into
//! Khazana.
//!
//! What this is allowed to see is deliberately narrow:
//! - the database is opened read-only, and never written;
//! - only SMS *received* from an alphanumeric sender ID ("AX-HDFCBK") that
//!   contains one of the bank keywords the page passes in are selected. Phone
//!   numbers and email addresses — every person you text — are excluded before
//!   any keyword is tried, and the filter is in the SQL, so a personal
//!   conversation is never loaded into memory at all;
//! - the text is handed to the page, parsed there, and dropped. Nothing here
//!   keeps, logs or caches it.
//!
//! Reading chat.db needs Full Disk Access, which only the user can grant. When
//! it is missing, macOS refuses the open and the page is told `no_access`.

use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde::Serialize;
use std::path::PathBuf;

/// Seconds from the Unix epoch to Apple's (1 Jan 2001).
const APPLE_EPOCH_OFFSET_MS: i64 = 978_307_200_000;
/// One poll never returns more than this; the next poll carries on from the cursor.
const BATCH_LIMIT: i64 = 500;
const MAX_KEYWORDS: usize = 40;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BankMessage {
    pub rowid: i64,
    pub sender: String,
    pub text: String,
    /// Epoch ms.
    pub received_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub messages: Vec<BankMessage>,
    /// Highest ROWID looked at, whether or not it matched — the next cursor.
    pub cursor: i64,
}

fn chat_db_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("no_home")?;
    Ok(PathBuf::from(home).join("Library/Messages/chat.db"))
}

/// Messages stores `date` in nanoseconds since 2001 on current macOS, and in
/// seconds on databases written before High Sierra.
fn apple_date_to_unix_ms(date: i64) -> i64 {
    if date > 1_000_000_000_000 {
        date / 1_000_000 + APPLE_EPOCH_OFFSET_MS
    } else {
        date * 1000 + APPLE_EPOCH_OFFSET_MS
    }
}

fn unix_ms_to_apple_ns(ms: i64) -> i64 {
    (ms - APPLE_EPOCH_OFFSET_MS).max(0) * 1_000_000
}

/// The message body from `attributedBody`, an NSAttributedString in Apple's
/// typedstream format. On macOS 13+ the plain `text` column is often NULL and
/// this blob is the only copy.
///
/// The string follows the `NSString` class name: a `+` marker, then a length
/// (one byte below 0x80; 0x81 then a little-endian u16; 0x82 then a u32), then
/// UTF-8 bytes. Anything that does not fit that shape is treated as no text.
pub fn decode_attributed_body(blob: &[u8]) -> Option<String> {
    const CLASS: &[u8] = b"NSString";
    let start = blob.windows(CLASS.len()).position(|w| w == CLASS)? + CLASS.len();
    let rest = &blob[start..];
    let plus = rest.iter().take(16).position(|&b| b == b'+')?;
    let mut i = plus + 1;
    let tag = *rest.get(i)?;
    i += 1;
    let len = match tag {
        0x81 => {
            let b = rest.get(i..i + 2)?;
            i += 2;
            u16::from_le_bytes([b[0], b[1]]) as usize
        }
        0x82 => {
            let b = rest.get(i..i + 4)?;
            i += 4;
            u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize
        }
        n if n < 0x80 => n as usize,
        _ => return None,
    };
    let bytes = rest.get(i..i + len)?;
    String::from_utf8(bytes.to_vec()).ok()
}

/// Sender keywords from the page, reduced to what can safely go in a LIKE
/// pattern: letters and digits only, so `%` and `_` cannot widen the match.
fn clean_keywords(keywords: &[String]) -> Vec<String> {
    keywords
        .iter()
        .map(|k| k.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>())
        .filter(|k| k.len() >= 3)
        .take(MAX_KEYWORDS)
        .collect()
}

pub fn read_from(
    conn: &Connection,
    since_rowid: i64,
    since_ms: i64,
    keywords: &[String],
) -> Result<ReadResult, String> {
    let keywords = clean_keywords(keywords);
    if keywords.is_empty() {
        return Ok(ReadResult { messages: vec![], cursor: since_rowid });
    }

    // The cursor advances over every received message, matched or not, so the
    // next poll does not rescan a batch of personal chats it already skipped.
    let max_rowid: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ROWID), 0) FROM (SELECT ROWID FROM message WHERE ROWID > ?1 ORDER BY ROWID LIMIT ?2)",
            [since_rowid, BATCH_LIMIT],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if max_rowid <= since_rowid {
        return Ok(ReadResult { messages: vec![], cursor: since_rowid });
    }

    let like = vec!["UPPER(h.id) LIKE ?"; keywords.len()].join(" OR ");
    let sql = format!(
        "SELECT m.ROWID, h.id, m.text, m.attributedBody, m.date
         FROM message m JOIN handle h ON h.ROWID = m.handle_id
         WHERE m.ROWID > ? AND m.ROWID <= ? AND m.is_from_me = 0 AND m.date >= ?
           AND m.service = 'SMS'
           AND h.id NOT LIKE '%@%' AND h.id NOT GLOB '+*' AND h.id NOT GLOB '[0-9]*'
           AND ({like})
         ORDER BY m.ROWID"
    );
    let mut args: Vec<rusqlite::types::Value> = vec![
        since_rowid.into(),
        max_rowid.into(),
        unix_ms_to_apple_ns(since_ms).into(),
    ];
    args.extend(keywords.iter().map(|k| format!("%{}%", k.to_uppercase()).into()));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(args), |r| {
            let text: Option<String> = r.get(2)?;
            let body: Option<Vec<u8>> = r.get(3)?;
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, text, body, r.get::<_, i64>(4)?))
        })
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for row in rows {
        let (rowid, sender, text, body, date) = row.map_err(|e| e.to_string())?;
        let text = text
            .filter(|t| !t.trim().is_empty())
            .or_else(|| body.as_deref().and_then(decode_attributed_body));
        if let Some(text) = text {
            messages.push(BankMessage { rowid, sender, text, received_at: apple_date_to_unix_ms(date) });
        }
    }
    Ok(ReadResult { messages, cursor: max_rowid })
}

/// Reads bank messages newer than `since_rowid` (and not older than `since_ms`).
#[tauri::command]
pub fn read_bank_messages(since_rowid: i64, since_ms: i64, keywords: Vec<String>) -> Result<ReadResult, String> {
    let path = chat_db_path()?;
    // Read-only and no mutex: Messages holds the database open and writes to it.
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| "no_access".to_string())?;
    // A refused open can still succeed lazily and fail on the first read.
    match read_from(&conn, since_rowid, since_ms, &keywords) {
        Err(e) if e.contains("authorization denied") || e.contains("unable to open") => Err("no_access".into()),
        other => other,
    }
}

/// Opens System Settings at Privacy & Security → Full Disk Access.
#[tauri::command]
pub fn open_full_disk_access_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, service TEXT);
             CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB,
               handle_id INTEGER, date INTEGER, is_from_me INTEGER, service TEXT);
             INSERT INTO handle VALUES (1, 'AX-HDFCBK', 'SMS'), (2, '+919876543210', 'SMS'), (3, 'VM-ICICIT-S', 'SMS'),
               (4, 'hdfc.friend@icloud.com', 'iMessage'), (5, '919876543210', 'SMS');",
        )
        .unwrap();
        c
    }

    fn typedstream(text: &str) -> Vec<u8> {
        let mut b = b"\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01\x94\x84\x01+".to_vec();
        let bytes = text.as_bytes();
        if bytes.len() < 0x80 {
            b.push(bytes.len() as u8);
        } else {
            b.push(0x81);
            b.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
        }
        b.extend_from_slice(bytes);
        b.extend_from_slice(b"\x86\x84\x02iI\x01");
        b
    }

    const OCT_2026_NS: i64 = 783_000_000_000_000_000; // ~Oct 2025 in Apple ns

    #[test]
    fn decodes_short_and_long_attributed_bodies() {
        assert_eq!(decode_attributed_body(&typedstream("Rs 450 debited")).as_deref(), Some("Rs 450 debited"));
        let long = "x".repeat(300);
        assert_eq!(decode_attributed_body(&typedstream(&long)).as_deref(), Some(long.as_str()));
        assert_eq!(decode_attributed_body(b"garbage"), None);
        assert_eq!(decode_attributed_body(b"NSString\x01\x94\x84\x01+\x81\xff"), None); // truncated
    }

    #[test]
    fn selects_only_received_bank_messages() {
        let c = fixture();
        c.execute("INSERT INTO message VALUES (1, 'Rs 450 debited at SWIGGY', NULL, 1, ?1, 0, 'SMS')", [OCT_2026_NS]).unwrap();
        c.execute("INSERT INTO message VALUES (2, 'personal chat', NULL, 2, ?1, 0, 'SMS')", [OCT_2026_NS]).unwrap();
        c.execute("INSERT INTO message VALUES (3, 'sent by me', NULL, 1, ?1, 1, 'SMS')", [OCT_2026_NS]).unwrap();
        // A person whose address happens to contain a bank keyword is still a person.
        c.execute("INSERT INTO message VALUES (5, 'hi from a friend', NULL, 4, ?1, 0, 'iMessage')", [OCT_2026_NS]).unwrap();
        c.execute("INSERT INTO message VALUES (6, 'hdfc meet?', NULL, 5, ?1, 0, 'SMS')", [OCT_2026_NS]).unwrap();
        c.execute("INSERT INTO message VALUES (4, NULL, ?1, 3, ?2, 0, 'SMS')",
            rusqlite::params![typedstream("INR 99 credited"), OCT_2026_NS]).unwrap();

        let r = read_from(&c, 0, 0, &["hdfc".into(), "icici".into()]).unwrap();
        let texts: Vec<_> = r.messages.iter().map(|m| m.text.as_str()).collect();
        assert_eq!(texts, ["Rs 450 debited at SWIGGY", "INR 99 credited"]);
        assert_eq!(r.messages[0].sender, "AX-HDFCBK");
        assert_eq!(r.cursor, 6, "cursor passes skipped personal messages too");

        let again = read_from(&c, r.cursor, 0, &["hdfc".into()]).unwrap();
        assert!(again.messages.is_empty());
        assert_eq!(again.cursor, 6);
    }

    #[test]
    fn honours_the_start_date_and_ignores_wildcards_in_keywords() {
        let c = fixture();
        c.execute("INSERT INTO message VALUES (1, 'old one', NULL, 1, ?1, 0, 'SMS')", [OCT_2026_NS - 1_000_000_000_000_000]).unwrap();
        c.execute("INSERT INTO message VALUES (2, 'new one', NULL, 1, ?1, 0, 'SMS')", [OCT_2026_NS]).unwrap();
        let since = apple_date_to_unix_ms(OCT_2026_NS) - 1000;
        let r = read_from(&c, 0, since, &["hdfc".into()]).unwrap();
        assert_eq!(r.messages.len(), 1);
        assert_eq!(r.messages[0].text, "new one");
        // "%" would match every sender; it is stripped, leaving nothing to match.
        assert!(read_from(&c, 0, 0, &["%".into(), "_".into()]).unwrap().messages.is_empty());
    }

    #[test]
    fn converts_both_apple_date_units() {
        assert_eq!(apple_date_to_unix_ms(0), APPLE_EPOCH_OFFSET_MS);
        assert_eq!(apple_date_to_unix_ms(60), APPLE_EPOCH_OFFSET_MS + 60_000);
        assert_eq!(apple_date_to_unix_ms(60_000_000_000_000), APPLE_EPOCH_OFFSET_MS + 60_000_000);
        assert_eq!(unix_ms_to_apple_ns(APPLE_EPOCH_OFFSET_MS + 1), 1_000_000);
    }
}
