# Play Console: SMS permissions declaration

Draft answers for the **Permissions Declaration Form** (App content → Sensitive
permissions → SMS and Call Log). Submit it only when SMS capture moves into the
Play build. Until then SMS stays in the `sideload` flavor, and the Play build
declares neither permission (see `android/app/src/sideload/AndroidManifest.xml`).

## Before submitting

1. Move `RECEIVE_SMS`, `READ_SMS` and the `SmsReceiver` entry from
   `src/sideload/AndroidManifest.xml` into the `play` flavor's manifest, and make
   `isSmsCaptureAvailable` return true in that flavor.
2. Build a release `play` AAB and upload it to a **closed testing** track. The
   declaration is reviewed against that build.
3. Record the demo video (script below) on that build and upload it unlisted.
4. Check that the privacy policy (`webapp/src/app/privacy`) still says what the
   "Data handling" answer below says.

## Form answers

**Permissions requested:** `READ_SMS`, `RECEIVE_SMS`.

**Core functionality:** *SMS-based money management.* Apps that track and
manage budget is a permitted exception in the SMS and Call Log policy.

**Describe how your app uses the permission (≤ 500 characters):**

> Khazana is a personal budget tracker. With the user's permission it reads
> bank and UPI transaction SMS (from bank sender IDs such as VM-HDFCBK) to
> record spending automatically. Each message is parsed on the device and then
> discarded. Only the amount, merchant, date and last digits of the account are
> stored, in an encrypted local database. SMS from phone numbers are ignored.
> No SMS content leaves the device.

**Why it can't be done another way:** bank alerts reach many users only as SMS.
Banks offer no consumer API for them, and the notification listener misses
alerts from banks that send no app notification. `READ_SMS` is used only to
import past bank SMS when the user taps "Import last 90 days". `RECEIVE_SMS` is
used to record new ones as they arrive.

**Is it the default handler?** No. Khazana does not send SMS and is not the
default SMS app. The policy exception does not require it.

## Data handling (must match the Data safety form and privacy policy)

- **Collected:** nothing. Processing is on-device only, and no SMS data is
  transmitted, so Data safety lists SMS as *not collected*.
- **Filtered in native code:** `SmsReceiver` and the inbox reader skip any
  sender that is a phone number. Personal messages never reach the Flutter side.
- **Kept:** amount, direction, merchant, date, last four digits, UPI reference
  and the bank's stated balance, stored in the SQLCipher (AES-256) vault.
- **Discarded:** the message body, immediately after parsing.
- **Prominent disclosure:** a full-screen explanation (what is read, why, where
  it goes, how to turn it off) appears before the system permission prompt,
  and the permission is requested only after the user taps Agree. See
  `lib/features/capture/widgets/sms_access_disclosure.dart`.
- **Off by default:** nothing is read until the user turns it on in
  Auto-capture.

## Demo video script (about 60 seconds)

1. Open Khazana, tap the avatar and choose Auto-capture. SMS is off.
2. Tap **Allow bank SMS**. Show the disclosure screen in full and tap Agree,
   then Allow in the system prompt.
3. Receive a bank SMS (on an emulator: `adb emu sms send VM-HDFCBK "…"`). It
   appears in **To review** within a second, showing the merchant, amount and
   last digits.
4. Receive an SMS from a phone number. Nothing appears.
5. Approve the capture and show it in the transaction list.
6. Open Android Settings → Apps → Khazana → Permissions and revoke SMS, to show
   that the user stays in control.

## If the review asks for changes

Google often answers with a policy citation instead of a reason. The usual
causes:

- The disclosure is not shown before the permission prompt.
- The video does not show the feature that uses the permission.
- The Data safety form disagrees with the declaration.

Fix the cited item and resubmit. Keep SMS in the `sideload` flavor until the
review is approved.
