const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
// The picker previews are committed PNGs rendered by scripts/build-widget-previews.mjs, which
// uses sharp and the app's own font. They replace a hand-rolled rasteriser that had no font
// support and drew every line of text as a grey bar - which made the Android widget picker look
// like a broken skeleton next to the iOS gallery.
const WIDGET_PREVIEW_SOURCE = 'assets/widget-previews';

// The scheme this build actually answers to. app.config.js declares an array whose first entry
// is canonical for the variant (ehllo-staging for staging, ehllo for production). Hardcoding
// "ehllo" here meant every widget tap on a staging build fired an ACTION_VIEW that no activity
// could handle, and did nothing at all - no error, no log.
function schemeFor(config) {
  const scheme = config?.scheme;
  if (Array.isArray(scheme)) return scheme[0] || 'ehllo';
  return scheme || 'ehllo';
}

const PACKAGE_SUFFIX = 'widget';
const PREFS_NAME = 'aftermeet_widget';
const PREFS = {
  cardsJson: 'cardsJson',
  logoImageBase64: 'logoImageBase64',
  connectionsDeepLink: 'connectionsDeepLink',
  recentConnectionsJson: 'recentConnectionsJson',
  signedIn: 'signedIn',
  scannerDeepLink: 'scannerDeepLink',
};

const WIDGETS = [
  {
    receiver: 'QrScanWidgetReceiver',
    label: 'ehllo',
    description: 'QR Scan',
    layout: 'aftermeet_widget_qr_scan',
    previewLayout: 'aftermeet_widget_qr_scan_preview',
    previewImage: 'aftermeet_widget_preview_qr_scan',
    info: 'aftermeet_widget_qr_scan_info',
    minWidth: '110dp',
    minHeight: '110dp',
    maxWidth: '110dp',
    maxHeight: '110dp',
    resizeMode: 'none',
    targetCellWidth: 2,
    targetCellHeight: 2,
  },
  {
    receiver: 'BusinessCardWidgetReceiver',
    label: 'ehllo',
    description: 'Business Card',
    layout: 'aftermeet_widget_business_card',
    previewLayout: 'aftermeet_widget_business_card_preview',
    previewImage: 'aftermeet_widget_preview_business_card',
    info: 'aftermeet_widget_business_card_info',
    minWidth: '250dp',
    minHeight: '110dp',
    maxWidth: '250dp',
    maxHeight: '110dp',
    resizeMode: 'none',
    legacyResizeMode: 'horizontal',
    targetCellWidth: 4,
    targetCellHeight: 2,
  },
  {
    receiver: 'RecentConnectionsWidgetReceiver',
    label: 'ehllo',
    description: 'Recent Connections',
    layout: 'aftermeet_widget_connections',
    previewLayout: 'aftermeet_widget_connections_preview',
    previewImage: 'aftermeet_widget_preview_connections',
    info: 'aftermeet_widget_connections_info',
    minWidth: '250dp',
    minHeight: '110dp',
    maxWidth: '250dp',
    maxHeight: '110dp',
    resizeMode: 'none',
    targetCellWidth: 4,
    targetCellHeight: 2,
  },
];

function widgetReceiverEntry(packageName, widget) {
  return {
    $: {
      'android:name': `${packageName}.${PACKAGE_SUFFIX}.${widget.receiver}`,
      'android:exported': 'true',
      'android:label': widget.label,
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
      },
    ],
    'meta-data': [
      {
        $: {
          'android:name': 'android.appwidget.provider',
          'android:resource': `@xml/${widget.info}`,
        },
      },
    ],
  };
}

function actionReceiverEntry(packageName) {
  return {
    $: {
      'android:name': `${packageName}.${PACKAGE_SUFFIX}.WidgetActionReceiver`,
      'android:exported': 'false',
    },
    'intent-filter': [
      {
        action: [
          { $: { 'android:name': `${packageName}.widget.ACTION_CARD_PREV` } },
          { $: { 'android:name': `${packageName}.widget.ACTION_CARD_NEXT` } },
        ],
      },
    ],
  };
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const packageName = config.android?.package || 'com.ehllo.app';
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.receiver = (application.receiver || []).filter(
      (item) => !String(item.$?.['android:name'] || '').includes(`${PACKAGE_SUFFIX}.`),
    );

    WIDGETS.forEach((widget) => {
      application.receiver.push(widgetReceiverEntry(packageName, widget));
    });
    application.receiver.push(actionReceiverEntry(packageName));

    const usesPermission = mod.modResults.manifest['uses-permission'] || [];
    if (!usesPermission.some((item) => item.$?.['android:name'] === 'android.permission.NFC')) {
      usesPermission.push({ $: { 'android:name': 'android.permission.NFC' } });
    }
    mod.modResults.manifest['uses-permission'] = usesPermission;

    const usesFeature = mod.modResults.manifest['uses-feature'] || [];
    if (!usesFeature.some((item) => item.$?.['android:name'] === 'android.hardware.nfc')) {
      usesFeature.push({
        $: {
          'android:name': 'android.hardware.nfc',
          'android:required': 'false',
        },
      });
    }
    mod.modResults.manifest['uses-feature'] = usesFeature;

    return mod;
  });
}

function addPackageToMainApplication(mainApplication, packageImport, packageInstance) {
  if (mainApplication.includes(packageImport)) return mainApplication;

  const importAnchor = 'import com.facebook.react.ReactApplication';
  let next = mainApplication.replace(importAnchor, `${importAnchor}\n${packageImport}`);

  const applyAnchor = 'PackageList(this).packages.apply {';
  if (next.includes(applyAnchor)) {
    return next.replace(applyAnchor, `${applyAnchor}\n          ${packageInstance.replace('packages.add', 'add')}`);
  }

  const packageAnchor = 'PackageList(this).packages';
  return next.replace(packageAnchor, `${packageInstance.replace('packages.add', 'add')}\n        ${packageAnchor}`);
}

function withWidgetModule(config) {
  return withMainApplication(config, (mod) => {
    const packageName = config.android?.package || 'com.ehllo.app';
    mod.modResults.contents = addPackageToMainApplication(
      mod.modResults.contents,
      `import ${packageName}.widget.QuickShareWidgetPackage`,
      'packages.add(QuickShareWidgetPackage())',
    );
    return mod;
  });
}

function kotlinBridge(packageName, defaultScheme) {
  return `package ${packageName}.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class QuickShareWidgetBridge(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "QuickShareWidgetBridge"

  @ReactMethod
  fun updateWidget(payload: ReadableMap, promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences("${PREFS_NAME}", Context.MODE_PRIVATE)
      val editor = prefs.edit()
        .putString("${PREFS.cardsJson}", payload.getString("cardsJson") ?: "[]")
        .putString("${PREFS.logoImageBase64}", payload.getString("logoImageBase64") ?: "")
        .putString("${PREFS.connectionsDeepLink}", payload.getString("connectionsDeepLink") ?: "${defaultScheme}://connections")
        .putString("${PREFS.recentConnectionsJson}", payload.getString("recentConnectionsJson") ?: "[]")
        // Absent means the widget gallery or a preview, where sample content is the right
        // answer - so this defaults to signed in rather than to the sign-in prompt.
        .putString("${PREFS.signedIn}", payload.getString("signedIn") ?: "1")
        .putString("${PREFS.scannerDeepLink}", payload.getString("scannerDeepLink") ?: "${defaultScheme}://scanner")

      for (slot in 1..3) {
        editor.putString("connection\${slot}Name", payload.getString("connection\${slot}Name") ?: "")
        editor.putString("connection\${slot}Subtitle", payload.getString("connection\${slot}Subtitle") ?: "")
        editor.putString("connection\${slot}Phone", payload.getString("connection\${slot}Phone") ?: "")
        editor.putString("connection\${slot}Email", payload.getString("connection\${slot}Email") ?: "")
        // Initials and the avatar photo are NOT copied here: recentConnectionsJson already
        // carries both, and duplicating base64 images into SharedPreferences would store every
        // avatar twice.
        editor.putString("connection\${slot}Profile", payload.getString("connection\${slot}Profile") ?: "")
        editor.putString("connection\${slot}Mail", payload.getString("connection\${slot}Mail") ?: "")
      }
      editor.apply()

      val manager = AppWidgetManager.getInstance(reactContext)
      listOf(
        QrScanWidgetReceiver::class.java,
        BusinessCardWidgetReceiver::class.java,
        RecentConnectionsWidgetReceiver::class.java,
      ).forEach { receiver ->
        val component = ComponentName(reactContext, receiver)
        manager.getAppWidgetIds(component).forEach { id ->
          WidgetRenderer.render(reactContext, manager, id, receiver)
        }
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("WIDGET_UPDATE_FAILED", error.message, error)
    }
  }
}
`;
}

function kotlinActionReceiver(packageName) {
  return `package ${packageName}.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return
    val direction = when (intent.action) {
      "${packageName}.widget.ACTION_CARD_PREV" -> -1
      "${packageName}.widget.ACTION_CARD_NEXT" -> 1
      else -> return
    }
    WidgetRenderer.shiftCardIndex(context, widgetId, direction)
    val manager = AppWidgetManager.getInstance(context)
    WidgetRenderer.render(context, manager, widgetId, BusinessCardWidgetReceiver::class.java)
  }
}
`;
}

function kotlinRenderer(packageName, defaultScheme) {
  return `package ${packageName}.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.util.Base64
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import org.json.JSONArray
import org.json.JSONObject
import ${packageName}.R

object WidgetRenderer {
  private const val DEMO_URL = "https://ehllo.io/c/demo"
  private const val DEMO_DEEP_LINK = "${defaultScheme}://share-card"

  private fun prefs(context: Context) =
    context.getSharedPreferences("${PREFS_NAME}", Context.MODE_PRIVATE)

  private fun cardIndexKey(widgetId: Int) = "widget_card_index_\$widgetId"

  fun shiftCardIndex(context: Context, widgetId: Int, direction: Int) {
    val cards = loadCards(context)
    if (cards.length() <= 1) return
    val store = prefs(context)
    val current = store.getInt(cardIndexKey(widgetId), 0)
    val next = (current + direction + cards.length()) % cards.length()
    store.edit().putInt(cardIndexKey(widgetId), next).apply()
  }

  private fun cardIndex(context: Context, widgetId: Int, cardCount: Int): Int {
    if (cardCount <= 0) return 0
    val current = prefs(context).getInt(cardIndexKey(widgetId), 0)
    return current.coerceIn(0, cardCount - 1)
  }

  // The scanner link the app sent for THIS build's scheme.
  private fun scannerLink(context: Context): String {
    val stored = prefs(context).getString("${PREFS.scannerDeepLink}", "") ?: ""
    return stored.ifBlank { "${defaultScheme}://scanner" }
  }

  private fun isSignedIn(context: Context): Boolean {
    // Defaults to signed OUT. The widget picker draws previewLayout/previewImage rather than
    // running this renderer, so reaching here with no stored value means a placed widget on a
    // phone whose app has never synced - which is signed out, not a preview.
    return (prefs(context).getString("${PREFS.signedIn}", "0") ?: "0") != "0"
  }

  // loadConnections substitutes demo people when the store is empty, which is right for the
  // gallery and wrong on a real home screen. This reports whether there is anything real, so
  // the renderer can tell "no connections yet" apart from "here are two invented ones".
  private fun hasRealConnections(context: Context): Boolean {
    val raw = prefs(context).getString("${PREFS.recentConnectionsJson}", "") ?: ""
    if (raw.isBlank()) return false
    return try {
      JSONArray(raw).length() > 0
    } catch (_: Exception) {
      false
    }
  }

  private fun placeholderCards(): JSONArray {
    return JSONArray().put(
      JSONObject()
        .put("name", "Alex Morgan")
        .put("role", "Product Designer")
        .put("company", "ehllo")
        .put("cardUrl", DEMO_URL)
        .put("shareDeepLink", DEMO_DEEP_LINK)
        .put("initials", "AM"),
    )
  }

  private fun placeholderConnections(): JSONArray {
    return JSONArray()
      .put(
        JSONObject()
          .put("name", "Jordan Lee")
          .put("subtitle", "Shared via your card")
          .put("phone", "")
          .put("email", ""),
      )
      .put(
        JSONObject()
          .put("name", "Cameron Williamson")
          .put("subtitle", "Shared via your card")
          .put("phone", "")
          .put("email", ""),
      )
  }

  fun loadCards(context: Context): JSONArray {
    val raw = prefs(context).getString("${PREFS.cardsJson}", "") ?: ""
    if (raw.isBlank()) return placeholderCards()
    return try {
      val parsed = JSONArray(raw)
      // An explicit empty array means the app synced and found no published primary card. That
      // is a state the widget renders on purpose, so it must NOT become the demo card here -
      // doing so is what put Alex Morgan on a real home screen.
      parsed
    } catch (_: Exception) {
      placeholderCards()
    }
  }

  private fun loadConnections(context: Context): JSONArray {
    val raw = prefs(context).getString("${PREFS.recentConnectionsJson}", "") ?: ""
    if (raw.isBlank()) return placeholderConnections()
    return try {
      val parsed = JSONArray(raw)
      if (parsed.length() == 0) placeholderConnections() else parsed
    } catch (_: Exception) {
      placeholderConnections()
    }
  }

  private fun decodeBitmap(base64: String?): Bitmap? {
    if (base64.isNullOrBlank()) return null
    return try {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
      null
    }
  }

  private fun dpToPx(context: Context, dp: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      dp.toFloat(),
      context.resources.displayMetrics,
    ).toInt()
  }

  private fun qrTargetSize(context: Context, manager: AppWidgetManager, widgetId: Int, fallbackDp: Int): Int {
    val options = manager.getAppWidgetOptions(widgetId)
    val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, fallbackDp)
    val minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, fallbackDp)
    val contentDp = (minOf(minWidthDp, minHeightDp) - 16).coerceAtLeast(72)
    return dpToPx(context, contentDp)
  }

  // The white card is drawn INTO the bitmap rather than being a background on a match_parent
  // FrameLayout. That layout took whatever aspect ratio the launcher handed the widget, so a
  // 2x2 that resolved to a non-square cell became a white rectangle with the square code
  // floating in it and dead white space down the long axis. A square bitmap with fitCenter is
  // always square, scales to the smaller axis, and lets the dark canvas show around it - which
  // is what the iOS widget does with a fixed centred card.
  //
  // Proportions follow iOS: a 130pt card carries a 116pt code (a 7pt quiet zone each side) and
  // a logo at about 26% of the code.
  private fun composeQrCard(qr: Bitmap, logo: Bitmap?, sizePx: Int): Bitmap {
    val out = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val side = sizePx.toFloat()
    val white = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    canvas.drawRoundRect(RectF(0f, 0f, side, side), side * 0.055f, side * 0.055f, white)

    val inset = (sizePx * 0.054f).toInt().coerceAtLeast(1)
    val codeSize = (sizePx - inset * 2).coerceAtLeast(1)
    canvas.drawBitmap(Bitmap.createScaledBitmap(qr, codeSize, codeSize, true), inset.toFloat(), inset.toFloat(), null)

    if (logo != null) {
      val logoSize = (codeSize * 0.26f).toInt().coerceAtLeast(1)
      // A white backing behind the logo, so it never sits directly on code modules.
      // 1.34 rather than 1.18: at 18% the white ring was too thin to see against the code.
      val backing = logoSize * 1.34f
      canvas.drawRoundRect(
        RectF((side - backing) / 2f, (side - backing) / 2f, (side + backing) / 2f, (side + backing) / 2f),
        backing * 0.22f,
        backing * 0.22f,
        white,
      )
      val left = (side - logoSize) / 2f
      canvas.drawBitmap(Bitmap.createScaledBitmap(logo, logoSize, logoSize, true), left, left, null)
    }
    return out
  }

  // A plain white rounded square, for the state where there is no published primary card to
  // draw a code from. Same geometry as composeQrCard so the two states sit identically.
  private fun blankQrCard(sizePx: Int): Bitmap {
    val out = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val side = sizePx.toFloat()
    canvas.drawRoundRect(
      RectF(0f, 0f, side, side),
      side * 0.055f,
      side * 0.055f,
      Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE },
    )
    return out
  }

  private fun qrBitmap(card: JSONObject, store: android.content.SharedPreferences, size: Int): Bitmap? {
    decodeBitmap(card.optString("qrImageBase64", ""))?.let { cached ->
      return Bitmap.createScaledBitmap(cached, size, size, true)
    }
    val cardUrl = card.optString("cardUrl", DEMO_URL)
    return generateQrBitmap(cardUrl, size, "#163300", "#FFFFFF")
  }

  private fun generateQrBitmap(content: String, size: Int, dark: String, light: String): Bitmap? {
    val value = content.ifBlank { DEMO_URL }
    return try {
      val hints = mapOf(
        EncodeHintType.MARGIN to 1,
        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.H,
      )
      val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, size, size, hints)
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
      val darkColor = Color.parseColor(dark)
      val lightColor = Color.parseColor(light)
      for (x in 0 until size) {
        for (y in 0 until size) {
          bitmap.setPixel(x, y, if (matrix.get(x, y)) darkColor else lightColor)
        }
      }
      bitmap
    } catch (_: Exception) {
      null
    }
  }

  private fun applyLogo(views: RemoteViews, logoId: Int, store: android.content.SharedPreferences) {
    decodeBitmap(store.getString("${PREFS.logoImageBase64}", ""))?.let { logo ->
      views.setViewVisibility(logoId, View.VISIBLE)
      views.setImageViewBitmap(logoId, logo)
    } ?: views.setViewVisibility(logoId, View.GONE)
  }

  private fun openAppIntent(context: Context, widgetId: Int, deepLink: String, requestCode: Int = 0): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink.ifBlank { DEMO_DEEP_LINK })).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    return PendingIntent.getActivity(
      context,
      widgetId + requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun cardActionIntent(context: Context, widgetId: Int, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(action).apply {
      setClass(context, WidgetActionReceiver::class.java)
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
    }
    return PendingIntent.getBroadcast(
      context,
      widgetId + requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun dialIntent(context: Context, widgetId: Int, phone: String, requestCode: Int): PendingIntent? {
    if (phone.isBlank()) return null
    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:\$phone"))
    return PendingIntent.getActivity(
      context,
      widgetId + requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  // Two bugs lived here.
  //
  // ACTION_VIEW on a mailto: URI frequently resolves to nothing, which is why tapping the
  // envelope "opened the email app" and then did nothing useful. ACTION_SENDTO is the
  // documented action for mailto: and sms:.
  //
  // And the envelope preferred SMS whenever a phone number existed, so an icon that plainly
  // means email opened a text message instead - and behaved differently from iOS, which
  // preferred email. The envelope is email; the handset is the phone.
  private fun messageIntent(context: Context, widgetId: Int, mailUrl: String, email: String, requestCode: Int): PendingIntent? {
    val uri = when {
      mailUrl.isNotBlank() -> Uri.parse(mailUrl)
      email.isNotBlank() -> Uri.parse("mailto:\$email")
      else -> return null
    }
    val intent = Intent(Intent.ACTION_SENDTO, uri)
    return PendingIntent.getActivity(
      context,
      widgetId + requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun render(context: Context, manager: AppWidgetManager, id: Int, receiver: Class<*>) {
    when (receiver) {
      QrScanWidgetReceiver::class.java -> renderQrScan(context, manager, id)
      BusinessCardWidgetReceiver::class.java -> renderBusinessCard(context, manager, id)
      RecentConnectionsWidgetReceiver::class.java -> renderConnections(context, manager, id)
    }
  }

  private fun renderQrScan(context: Context, manager: AppWidgetManager, id: Int) {
    val store = prefs(context)
    val cards = loadCards(context)
    val card = cards.optJSONObject(0) ?: JSONObject()
    val deepLink = card.optString("shareDeepLink", DEMO_DEEP_LINK)
    val size = qrTargetSize(context, manager, id, 110)
    val views = RemoteViews(context.packageName, R.layout.aftermeet_widget_qr_scan)
    // A demo QR on a signed-out home screen is worse than no QR: it looks scannable and
    // points at a demo page. Say so instead, as the iOS widget does.
    if (isSignedIn(context)) {
      views.setViewVisibility(R.id.aftermeet_qr_scan_signin, View.GONE)
      views.setViewVisibility(R.id.aftermeet_qr_scan_image, View.VISIBLE)
      // The logo is composited into the card bitmap now, so the overlay ImageView stays hidden
      // - at a fixed dp it could not stay proportional to a card that scales.
      views.setViewVisibility(R.id.aftermeet_qr_scan_logo, View.GONE)
      qrBitmap(card, store, size)?.let { code ->
        val logo = decodeBitmap(store.getString("${PREFS.logoImageBase64}", ""))
        views.setImageViewBitmap(R.id.aftermeet_qr_scan_image, composeQrCard(code, logo, size))
      }
    } else {
      views.setViewVisibility(R.id.aftermeet_qr_scan_image, View.GONE)
      views.setViewVisibility(R.id.aftermeet_qr_scan_logo, View.GONE)
      views.setViewVisibility(R.id.aftermeet_qr_scan_signin, View.VISIBLE)
    }
    views.setOnClickPendingIntent(R.id.aftermeet_qr_scan_root, openAppIntent(context, id, deepLink))
    manager.updateAppWidget(id, views)
  }

  private fun renderBusinessCard(context: Context, manager: AppWidgetManager, id: Int) {
    val store = prefs(context)
    val cards = loadCards(context)
    // Always the primary card - the app sends only that one, so there is no stored per-widget
    // index to honour any more.
    val card = cards.optJSONObject(0) ?: JSONObject()
    val signedIn = isSignedIn(context)
    // Only a published primary card renders. The app now sends no cards when there is none, so
    // "nothing real to show" is a state rather than a gap to paper over with the demo person.
    val hasCard = cards.length() > 0 && card.optString("name", "").isNotBlank()
    val placeholder = signedIn && !hasCard
    val name = if (placeholder) "Your name" else card.optString("name", "Alex Morgan")
    val role = if (placeholder) "Your role" else card.optString("role", "Product Designer")
    val company = if (placeholder) "" else card.optString("company", "ehllo")
    val deepLink = card.optString("shareDeepLink", DEMO_DEEP_LINK)
    val initials = if (placeholder) "" else card.optString("initials", "AM")
    val views = RemoteViews(context.packageName, R.layout.aftermeet_widget_business_card)

    // Matching the iOS widget: signed out, the card falls back to the demo person, so the
    // home screen showed Alex Morgan's name and company as though they were yours.
    views.setTextViewText(R.id.aftermeet_card_initials, if (signedIn) initials else "")
    views.setTextViewText(R.id.aftermeet_card_name, if (signedIn) name else "Sign in to ehllo")
    views.setTextViewText(R.id.aftermeet_card_role, if (signedIn) role else "Your card appears here")
    views.setTextViewText(R.id.aftermeet_card_company, if (signedIn) company else "")
    // The same composited white card the QR widget uses, so the two widgets show the code the
    // same way: a square white card with its quiet zone and a ringed logo, rather than a raw
    // code on a dark panel with a separate fixed-size logo pinned over it.
    views.setViewVisibility(R.id.aftermeet_card_qr_logo, View.GONE)
    val cardQrPx = dpToPx(context, 90)
    val cardLogo = decodeBitmap(store.getString("${PREFS.logoImageBase64}", ""))
    val codeBitmap = if (placeholder) null else qrBitmap(card, store, cardQrPx)
    if (codeBitmap != null) {
      views.setImageViewBitmap(R.id.aftermeet_card_qr, composeQrCard(codeBitmap, cardLogo, cardQrPx))
    } else {
      // Placeholder state: a blank white card, matching iOS, rather than an empty dark gap.
      views.setImageViewBitmap(R.id.aftermeet_card_qr, blankQrCard(cardQrPx))
    }

    decodeBitmap(card.optString("photoImageBase64", ""))?.let {
      views.setViewVisibility(R.id.aftermeet_card_initials, View.GONE)
      views.setViewVisibility(R.id.aftermeet_card_photo, View.VISIBLE)
      views.setImageViewBitmap(R.id.aftermeet_card_photo, it)
    } ?: run {
      views.setViewVisibility(R.id.aftermeet_card_initials, View.VISIBLE)
      views.setViewVisibility(R.id.aftermeet_card_photo, View.GONE)
    }

    // No pager. The widget always shows the card set as primary in the card home, which is
    // the only card the app now sends, so there is nothing to page between and no arrows to
    // draw. Deciding whether to show arrows from the card count is a lot of machinery for a
    // widget whose job is to show one card.
    views.setViewVisibility(R.id.aftermeet_card_pager, View.GONE)

    views.setOnClickPendingIntent(R.id.aftermeet_card_body, openAppIntent(context, id, deepLink, 5000))
    manager.updateAppWidget(id, views)
  }

  private fun renderConnections(context: Context, manager: AppWidgetManager, id: Int) {
    val store = prefs(context)
    val deepLink = store.getString("${PREFS.connectionsDeepLink}", "${defaultScheme}://connections") ?: "${defaultScheme}://connections"
    val connections = loadConnections(context)
    val views = RemoteViews(context.packageName, R.layout.aftermeet_widget_connections)
    var visibleRows = 0

    // Signed out, loadConnections returns Jordan Lee and Cameron Williamson, so the home
    // screen listed invented people as though they were yours. Signed in with nothing yet,
    // every row went GONE and the empty view was GONE too - a completely blank widget.
    // Both cases now say what is actually going on.
    val signedIn = isSignedIn(context)
    if (!signedIn || !hasRealConnections(context)) {
      views.setTextViewText(
        R.id.aftermeet_connections_empty,
        if (signedIn) "Share your card to see new connections here." else "Sign in to see the people you meet",
      )
      views.setViewVisibility(R.id.aftermeet_connections_empty, View.VISIBLE)
      views.setViewVisibility(R.id.aftermeet_connections_list, View.GONE)
      // Signed in with nothing yet, the pill is the actual next step. Signed out it is not -
      // the scanner would just bounce off the sign-in screen.
      if (signedIn) {
        views.setViewVisibility(R.id.aftermeet_connections_add, View.VISIBLE)
        views.setOnClickPendingIntent(
          R.id.aftermeet_connections_add,
          openAppIntent(context, id, scannerLink(context), 6100),
        )
      } else {
        views.setViewVisibility(R.id.aftermeet_connections_add, View.GONE)
      }
      views.setOnClickPendingIntent(R.id.aftermeet_connections_root, openAppIntent(context, id, deepLink, 6000))
      manager.updateAppWidget(id, views)
      return
    }

    // Two slots now, matching the layout and the iOS widget.
    for (slot in 1..2) {
      val connection = connections.optJSONObject(slot - 1)
      val rowId = if (slot == 1) R.id.aftermeet_connection_row_1 else R.id.aftermeet_connection_row_2
      val nameId = if (slot == 1) R.id.aftermeet_connection_name_1 else R.id.aftermeet_connection_name_2
      val subtitleId = if (slot == 1) R.id.aftermeet_connection_subtitle_1 else R.id.aftermeet_connection_subtitle_2
      val avatarId = if (slot == 1) R.id.aftermeet_connection_avatar_1 else R.id.aftermeet_connection_avatar_2
      val photoId = if (slot == 1) R.id.aftermeet_connection_photo_1 else R.id.aftermeet_connection_photo_2
      val phoneId = if (slot == 1) R.id.aftermeet_connection_phone_1 else R.id.aftermeet_connection_phone_2
      val messageId = if (slot == 1) R.id.aftermeet_connection_message_1 else R.id.aftermeet_connection_message_2

      if (connection == null) {
        views.setViewVisibility(rowId, View.GONE)
        continue
      }

      val name = connection.optString("name", "")
      val subtitle = connection.optString("subtitle", "Connected through ehllo")
      val phone = connection.optString("phone", "")
      val email = connection.optString("email", "")
      val initials = connection.optString("initials", "")
      val followUpMail = store.getString("connection\${slot}Mail", "") ?: ""
      val profileLink = store.getString("connection\${slot}Profile", "") ?: ""

      visibleRows += 1
      views.setViewVisibility(rowId, View.VISIBLE)
      views.setTextViewText(nameId, name)
      views.setTextViewText(subtitleId, subtitle)
      views.setTextViewText(
        avatarId,
        initials.ifBlank { name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?" },
      )

      // A real photo when there is one, the green initials circle when there is not - the same
      // two states the iOS widget has.
      val photo = decodeBitmap(connection.optString("photoImageBase64", ""))
      if (photo != null) {
        views.setImageViewBitmap(photoId, photo)
        views.setViewVisibility(photoId, View.VISIBLE)
        views.setViewVisibility(avatarId, View.GONE)
      } else {
        views.setViewVisibility(photoId, View.GONE)
        views.setViewVisibility(avatarId, View.VISIBLE)
      }

      // An action with nothing behind it is hidden rather than shown dead. Both used to be
      // drawn always, and tapping one with no number simply did nothing.
      val dial = dialIntent(context, id, phone, slot * 10)
      if (dial != null) {
        views.setViewVisibility(phoneId, View.VISIBLE)
        views.setOnClickPendingIntent(phoneId, dial)
      } else {
        views.setViewVisibility(phoneId, View.GONE)
      }
      // Tapping the person opens THAT person. Only the empty area around the rows falls
      // through to the root intent, which still opens the people you met.
      if (profileLink.isNotBlank()) {
        views.setOnClickPendingIntent(rowId, openAppIntent(context, id, profileLink, slot * 10 + 200))
      }
      val message = messageIntent(context, id, followUpMail, email, slot * 10 + 100)
      if (message != null) {
        views.setViewVisibility(messageId, View.VISIBLE)
        views.setOnClickPendingIntent(messageId, message)
      } else {
        views.setViewVisibility(messageId, View.GONE)
      }
    }

    // The add pill takes the place of a second row when there is only one connection, so the
    // widget always has two lines of content instead of a row and a gap.
    if (visibleRows > 1) {
      views.setViewVisibility(R.id.aftermeet_connections_add, View.GONE)
    } else {
      views.setViewVisibility(R.id.aftermeet_connections_add, View.VISIBLE)
      views.setOnClickPendingIntent(
        R.id.aftermeet_connections_add,
        openAppIntent(context, id, scannerLink(context), 6100),
      )
    }

    views.setViewVisibility(R.id.aftermeet_connections_empty, View.GONE)
    views.setViewVisibility(R.id.aftermeet_connections_list, View.VISIBLE)
    views.setOnClickPendingIntent(R.id.aftermeet_connections_root, openAppIntent(context, id, deepLink, 6000))
    manager.updateAppWidget(id, views)
  }
}

class QrScanWidgetReceiver : android.appwidget.AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { WidgetRenderer.render(context, manager, it, QrScanWidgetReceiver::class.java) }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: android.os.Bundle) {
    WidgetRenderer.render(context, manager, appWidgetId, QrScanWidgetReceiver::class.java)
  }
}

class BusinessCardWidgetReceiver : android.appwidget.AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { WidgetRenderer.render(context, manager, it, BusinessCardWidgetReceiver::class.java) }
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: android.os.Bundle) {
    WidgetRenderer.render(context, manager, appWidgetId, BusinessCardWidgetReceiver::class.java)
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    val editor = context.getSharedPreferences("${PREFS_NAME}", Context.MODE_PRIVATE).edit()
    appWidgetIds.forEach { editor.remove("widget_card_index_\$it") }
    editor.apply()
  }
}

class RecentConnectionsWidgetReceiver : android.appwidget.AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { WidgetRenderer.render(context, manager, it, RecentConnectionsWidgetReceiver::class.java) }
  }
}
`;
}

function layoutQrScan() {
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/aftermeet_qr_scan_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/aftermeet_widget_dark_background_compact"
  android:padding="6dp">
  <FrameLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent">
    <ImageView
      android:id="@+id/aftermeet_qr_scan_image"
      android:layout_width="match_parent"
      android:layout_height="match_parent"
      android:layout_gravity="center"
      android:adjustViewBounds="true"
      android:contentDescription="Scan QR code"
      android:scaleType="fitCenter" />
    <ImageView
      android:id="@+id/aftermeet_qr_scan_logo"
      android:layout_width="20dp"
      android:layout_height="20dp"
      android:layout_gravity="center"
      android:background="@drawable/aftermeet_widget_logo_backing"
      android:contentDescription="ehllo logo"
      android:padding="2dp"
      android:scaleType="fitCenter"
      android:visibility="gone" />
    <TextView
      android:id="@+id/aftermeet_qr_scan_signin"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_gravity="center"
      android:gravity="center"
      android:padding="6dp"
      android:text="Sign in to share your card"
      android:textColor="#87EA5C"
      android:textSize="11sp"
      android:textStyle="bold"
      android:visibility="gone" />
  </FrameLayout>
</FrameLayout>`;
}

function layoutQrScanPreview() {
  return layoutQrScan();
}

function layoutBusinessCard() {
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/aftermeet_card_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:padding="0dp">
  <LinearLayout
    android:id="@+id/aftermeet_card_body"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_gravity="center_vertical"
    android:background="@drawable/aftermeet_widget_dark_background_wide"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:padding="8dp">
    <FrameLayout
      android:layout_width="90dp"
      android:layout_height="90dp">
      <ImageView
        android:id="@+id/aftermeet_card_qr"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:layout_gravity="center"
        android:adjustViewBounds="true"
        android:contentDescription="Scan QR code"
        android:scaleType="fitCenter" />
      <ImageView
        android:id="@+id/aftermeet_card_qr_logo"
        android:layout_width="16dp"
        android:layout_height="16dp"
        android:layout_gravity="center"
        android:background="@drawable/aftermeet_widget_logo_backing"
        android:contentDescription="ehllo logo"
        android:padding="3dp"
        android:scaleType="fitCenter"
        android:visibility="gone" />
    </FrameLayout>
    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_marginLeft="10dp"
      android:layout_weight="1"
      android:orientation="vertical">
      <TextView
        android:id="@+id/aftermeet_card_initials"
        android:layout_width="32dp"
        android:layout_height="32dp"
        android:background="@drawable/aftermeet_widget_avatar_ring"
        android:gravity="center"
        android:text="AM"
        android:textColor="#FFFFFF"
        android:textSize="10sp"
        android:textStyle="bold" />
      <ImageView
        android:id="@+id/aftermeet_card_photo"
        android:layout_width="32dp"
        android:layout_height="32dp"
        android:contentDescription="Profile photo"
        android:scaleType="centerCrop"
        android:visibility="gone" />
      <TextView
        android:id="@+id/aftermeet_card_name"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="Alex Morgan"
        android:textColor="#FFFFFF"
        android:textSize="15sp"
        android:textStyle="bold" />
      <TextView
        android:id="@+id/aftermeet_card_role"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="Product Designer"
        android:textColor="#BDBDBD"
        android:textSize="12sp" />
      <TextView
        android:id="@+id/aftermeet_card_company"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="ehllo"
        android:textColor="#8F8F8F"
        android:textSize="12sp" />
      <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:visibility="gone"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <LinearLayout
          android:id="@+id/aftermeet_card_pager"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:gravity="center_vertical"
          android:orientation="horizontal"
          android:visibility="gone">
          <TextView
            android:id="@+id/aftermeet_card_pager_label"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="CARD 01"
            android:textColor="#8F8F8F"
            android:textSize="8sp"
            android:textStyle="bold" />
          <TextView
            android:id="@+id/aftermeet_card_prev"
            android:layout_width="22dp"
            android:layout_height="22dp"
            android:layout_marginLeft="6dp"
            android:gravity="center"
            android:text="‹"
            android:textColor="#FFFFFF"
            android:textSize="14sp"
            android:textStyle="bold" />
          <TextView
            android:id="@+id/aftermeet_card_next"
            android:layout_width="22dp"
            android:layout_height="22dp"
            android:gravity="center"
            android:text="›"
            android:textColor="#FFFFFF"
            android:textSize="14sp"
            android:textStyle="bold" />
        </LinearLayout>
      </LinearLayout>
    </LinearLayout>
  </LinearLayout>
</FrameLayout>`;
}

function layoutBusinessCardPreview() {
  return layoutBusinessCard();
}

function layoutConnectionsPreview() {
  return layoutConnections(true);
}

function layoutConnections(preview = false) {
  // Two rows, matching the iOS widget and the layout guide. The third row is gone: at 30dp a
  // third row plus the header does not fit the height a 4x2 widget has on smaller phones.
  const rows = [1, 2].map((slot) => {
    const sampleNames = ['Raphael Okojie', 'Christain Bale'];
    const sampleName = preview ? sampleNames[slot - 1] : '';
    const sampleInitial = preview ? sampleName.charAt(0) : '';
    return `
    <LinearLayout
      android:id="@+id/aftermeet_connection_row_${slot}"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="${slot === 1 ? '0' : '6'}dp"
      android:gravity="center_vertical"
      android:orientation="horizontal"
      android:visibility="${preview ? 'visible' : 'gone'}">
      <FrameLayout
        android:layout_width="30dp"
        android:layout_height="30dp">
        <TextView
          android:id="@+id/aftermeet_connection_avatar_${slot}"
          android:layout_width="30dp"
          android:layout_height="30dp"
          android:background="@drawable/aftermeet_widget_avatar_ring"
          android:gravity="center"
          android:text="${sampleInitial}"
          android:textColor="#FFFFFF"
          android:textSize="12sp" />
        <ImageView
          android:id="@+id/aftermeet_connection_photo_${slot}"
          android:layout_width="30dp"
          android:layout_height="30dp"
          android:contentDescription="Profile photo"
          android:scaleType="centerCrop"
          android:visibility="gone" />
      </FrameLayout>
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="10dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
          android:id="@+id/aftermeet_connection_name_${slot}"
          android:layout_width="match_parent"
          android:layout_height="wrap_content"
          android:ellipsize="end"
          android:maxLines="1"
          android:text="${preview ? sampleName : ''}"
          android:textColor="#FFFFFF"
          android:textSize="14sp" />
        <TextView
          android:id="@+id/aftermeet_connection_subtitle_${slot}"
          android:layout_width="match_parent"
          android:layout_height="wrap_content"
          android:ellipsize="end"
          android:maxLines="1"
          android:text="${preview ? (slot === 1 ? 'Connected 2 mins ago' : 'Connected 1 day ago') : ''}"
          android:textColor="#BDBDBD"
          android:textSize="11sp" />
      </LinearLayout>
      <ImageView
        android:id="@+id/aftermeet_connection_phone_${slot}"
        android:layout_width="26dp"
        android:layout_height="26dp"
        android:background="@drawable/aftermeet_widget_action_chip"
        android:contentDescription="Call"
        android:padding="6dp"
        android:src="@drawable/aftermeet_widget_ic_phone" />
      <ImageView
        android:id="@+id/aftermeet_connection_message_${slot}"
        android:layout_width="26dp"
        android:layout_height="26dp"
        android:layout_marginStart="8dp"
        android:background="@drawable/aftermeet_widget_action_chip"
        android:contentDescription="Email"
        android:padding="6dp"
        android:src="@drawable/aftermeet_widget_ic_mail" />
    </LinearLayout>`;
  }).join('');

  // Same shape as the business card: the root is transparent and full-bleed (so the whole
  // widget is still one tap target), and the dark card sits inside it at wrap_content height,
  // centred. The card hugs its rows instead of stretching to fill a 215dp-tall cell, and the
  // space it does not need stays transparent.
  //
  // HEIGHT BUDGET - do not tune these against one phone. A 4x2 widget declares minHeight 110dp
  // and the launcher may give exactly that; this device happens to give 215dp, which hides any
  // overflow. Keep the total at or under 110dp:
  //   8 + 8 padding + 14 header + 6 gap + 32 row + 6 gap + 32 row = 106dp
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/aftermeet_connections_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent">
  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_gravity="center_vertical"
    android:background="@drawable/aftermeet_widget_dark_background_wide"
    android:orientation="vertical"
    android:paddingHorizontal="16dp"
    android:paddingVertical="8dp">
  <TextView
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="Recent Connections"
    android:textColor="#87EA5C"
    android:textSize="11sp"
    android:textStyle="bold" />
  <TextView
    android:id="@+id/aftermeet_connections_empty"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="10dp"
    android:text="Share your card to see new connections here."
    android:textColor="#BDBDBD"
    android:textSize="12sp"
    android:visibility="gone" />
  <LinearLayout
    android:id="@+id/aftermeet_connections_list"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:orientation="vertical">${rows}
    </LinearLayout>
  <LinearLayout
    android:id="@+id/aftermeet_connections_add"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:background="@drawable/aftermeet_widget_add_pill"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:paddingHorizontal="12dp"
    android:paddingVertical="6dp"
    android:visibility="gone">
    <ImageView
      android:layout_width="13dp"
      android:layout_height="13dp"
      android:contentDescription="Add"
      android:src="@drawable/aftermeet_widget_ic_plus" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="6dp"
      android:text="Add new connection"
      android:textColor="#FFFFFF"
      android:textSize="12sp" />
    </LinearLayout>
  </LinearLayout>
</FrameLayout>`;
}

function widgetInfoLegacy(widget) {
  const descriptionRef = {
    'QR Scan': '@string/aftermeet_widget_qr_description',
    'Business Card': '@string/aftermeet_widget_business_description',
    'Recent Connections': '@string/aftermeet_widget_connections_description',
  }[widget.description] || '@string/app_name';
  const resizeMode = widget.legacyResizeMode || widget.resizeMode || 'none';
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="${descriptionRef}"
  android:initialLayout="@layout/${widget.layout}"
  android:minWidth="${widget.minWidth}"
  android:minHeight="${widget.minHeight}"
  android:previewImage="@drawable/${widget.previewImage}"
  android:previewLayout="@layout/${widget.previewLayout}"
  android:resizeMode="${resizeMode}"
  android:updatePeriodMillis="0"
  android:widgetCategory="home_screen" />`;
}

function widgetInfoV31(widget) {
  const descriptionRef = {
    'QR Scan': '@string/aftermeet_widget_qr_description',
    'Business Card': '@string/aftermeet_widget_business_description',
    'Recent Connections': '@string/aftermeet_widget_connections_description',
  }[widget.description] || '@string/app_name';
  const maxWidth = widget.maxWidth || widget.minWidth;
  const maxHeight = widget.maxHeight || widget.minHeight;
  const target = widget.targetCellWidth
    ? `android:targetCellWidth="${widget.targetCellWidth}" android:targetCellHeight="${widget.targetCellHeight}"`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="${descriptionRef}"
  android:initialLayout="@layout/${widget.layout}"
  android:minWidth="${widget.minWidth}"
  android:minHeight="${widget.minHeight}"
  android:minResizeWidth="${widget.minWidth}"
  android:minResizeHeight="${widget.minHeight}"
  android:maxResizeWidth="${maxWidth}"
  android:maxResizeHeight="${maxHeight}"
  android:previewImage="@drawable/${widget.previewImage}"
  android:previewLayout="@layout/${widget.previewLayout}"
  android:resizeMode="${widget.resizeMode || 'none'}"
  ${target}
  android:updatePeriodMillis="0"
  android:widgetCategory="home_screen" />`;
}

function drawablePreviewQr() {
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="120dp"
  android:height="120dp"
  android:viewportWidth="120"
  android:viewportHeight="120">
  <path android:fillColor="#FFFFFF" android:pathData="M0,0h120v120h-120z" />
  <path android:fillColor="#163300" android:pathData="M8,8h28v28h-28zM14,14h16v16h-16zM18,18h8v8h-8z" />
  <path android:fillColor="#163300" android:pathData="M84,8h28v28h-28zM90,14h16v16h-16zM94,18h8v8h-8z" />
  <path android:fillColor="#163300" android:pathData="M8,84h28v28h-28zM14,90h16v16h-16zM18,94h8v8h-8z" />
  <path android:fillColor="#163300" android:pathData="M44,12h4v4h-4zM52,12h4v4h-4zM60,20h4v4h-4zM40,28h4v4h-4zM48,36h8v4h-8zM64,32h4v8h-4zM76,40h4v4h-4zM36,44h4v4h-4zM56,48h12v4h-12zM72,52h4v4h-4zM44,56h4v8h-4zM60,60h8v4h-8zM52,68h4v4h-4zM68,68h12v4h-12zM40,64h4v4h-4zM80,64h4v4h-4zM48,80h4v4h-4zM64,80h4v4h-4zM72,88h4v4h-4zM84,52h4v8h-4zM88,72h4v4h-4zM92,84h4v4h-4z" />
</vector>`;
}

function drawablePreviewLogo() {
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path android:fillColor="#9FE870" android:pathData="M4,4h16v16h-16z" />
  <path android:fillColor="#163300" android:pathData="M7,12h10v2h-10zM11,8h2v8h-2z" />
</vector>`;
}

function withWidgetFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidRoot = path.join(projectRoot, 'android', 'app', 'src', 'main');
      const packageName = config.android?.package || 'com.ehllo.app';
      const packagePath = packageName.split('.').join(path.sep);
      const kotlinDir = path.join(androidRoot, 'java', packagePath, 'widget');
      const layoutDir = path.join(androidRoot, 'res', 'layout');
      const xmlDir = path.join(androidRoot, 'res', 'xml');
      const xmlV31Dir = path.join(androidRoot, 'res', 'xml-v31');
      const drawableDir = path.join(androidRoot, 'res', 'drawable');
      const drawableNodpiDir = path.join(androidRoot, 'res', 'drawable-nodpi');
      fs.mkdirSync(kotlinDir, { recursive: true });
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(xmlV31Dir, { recursive: true });
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.mkdirSync(drawableNodpiDir, { recursive: true });

      // Copy the committed previews. Deliberately loud if one is missing: a silently absent
      // preview means the picker falls back to the app icon, which is the sort of thing nobody
      // notices for weeks.
      const previewSourceDir = path.join(projectRoot, WIDGET_PREVIEW_SOURCE);
      for (const widget of WIDGETS) {
        const file = `${widget.previewImage}.png`;
        const from = path.join(previewSourceDir, file);
        if (!fs.existsSync(from)) {
          throw new Error(
            `[withAndroidQuickShareWidget] missing widget preview ${WIDGET_PREVIEW_SOURCE}/${file}. `
            + 'Run: node scripts/build-widget-previews.mjs',
          );
        }
        fs.copyFileSync(from, path.join(drawableNodpiDir, file));
      }

      fs.writeFileSync(path.join(kotlinDir, 'QuickShareWidgetBridge.kt'), kotlinBridge(packageName, schemeFor(config)));
      fs.writeFileSync(path.join(kotlinDir, 'WidgetActionReceiver.kt'), kotlinActionReceiver(packageName));
      fs.writeFileSync(
        path.join(kotlinDir, 'QuickShareWidgetPackage.kt'),
        `package ${packageName}.widget

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class QuickShareWidgetPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(QuickShareWidgetBridge(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`,
      );
      fs.writeFileSync(path.join(kotlinDir, 'WidgetRenderer.kt'), kotlinRenderer(packageName, schemeFor(config)));

      fs.writeFileSync(path.join(layoutDir, 'aftermeet_widget_qr_scan.xml'), layoutQrScan());
      fs.writeFileSync(path.join(layoutDir, 'aftermeet_widget_qr_scan_preview.xml'), layoutQrScanPreview());
      fs.writeFileSync(path.join(layoutDir, 'aftermeet_widget_business_card.xml'), layoutBusinessCard());
      fs.writeFileSync(path.join(layoutDir, 'aftermeet_widget_business_card_preview.xml'), layoutBusinessCardPreview());
      fs.writeFileSync(path.join(layoutDir, 'aftermeet_widget_connections.xml'), layoutConnections(false));
      fs.writeFileSync(path.join(layoutDir, 'aftermeet_widget_connections_preview.xml'), layoutConnectionsPreview());

      const stringsPath = path.join(androidRoot, 'res', 'values', 'aftermeet_widget_strings.xml');
      fs.writeFileSync(
        stringsPath,
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="aftermeet_widget_qr_description">QR Scan</string>
  <string name="aftermeet_widget_business_description">Business Card</string>
  <string name="aftermeet_widget_connections_description">Recent Connections</string>
</resources>
`,
      );

      WIDGETS.forEach((widget) => {
        fs.writeFileSync(path.join(xmlDir, `${widget.info}.xml`), widgetInfoLegacy(widget));
        fs.writeFileSync(path.join(xmlV31Dir, `${widget.info}.xml`), widgetInfoV31(widget));
      });

      const drawables = {
        // Transparent, so the QR widget is just the white code card floating on the wallpaper.
        // Only the QR Scan widget uses the compact drawable, so this does not touch the business
        // card or recent connections, which keep their black canvas.
        'aftermeet_widget_dark_background_compact.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#00000000" /><corners android:radius="16dp" /></shape>`,
        // Black on every widget, on both platforms.
        'aftermeet_widget_dark_background_wide.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#000000" /><corners android:radius="20dp" /></shape>`,
        // No stroke. iOS is a plain white card at a 7.2pt radius; the 3dp accent outline here
        // made the same widget look different on the two platforms.
        'aftermeet_widget_accent_frame_compact.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#FFFFFF" /><corners android:radius="7dp" /></shape>`,
        'aftermeet_widget_qr_dark_panel.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#000000" /><corners android:radius="12dp" /></shape>`,
        // #5DC154 solid with no ring, and #4E4E4E chips - matching the iOS widget rather than
        // the older dark-green palette.
        'aftermeet_widget_avatar_ring.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval"><solid android:color="#5DC154" /></shape>`,
        'aftermeet_widget_action_chip.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval"><solid android:color="#4E4E4E" /></shape>`,
        'aftermeet_widget_add_pill.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#4E4E4E" /><corners android:radius="13dp" /></shape>`,
        // RemoteViews cannot use SF Symbols, so the phone, envelope and plus that iOS draws as
        // symbols are these three vectors. They replace the ☎ / ✉ characters, which rendered in
        // whatever glyph the device font happened to have.
        'aftermeet_widget_ic_phone.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M6.6,10.8c1.4,2.8 3.8,5.1 6.6,6.6l2.2,-2.2c0.3,-0.3 0.7,-0.4 1,-0.2 1.1,0.4 2.3,0.6 3.5,0.6 0.6,0 1,0.4 1,1V20c0,0.6 -0.4,1 -1,1 -9.4,0 -17,-7.6 -17,-17 0,-0.6 0.4,-1 1,-1h3.5c0.6,0 1,0.4 1,1 0,1.2 0.2,2.4 0.6,3.5 0.1,0.3 0,0.7 -0.2,1z"/></vector>`,
        'aftermeet_widget_ic_mail.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M20,4H4C2.9,4 2,4.9 2,6v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V6C22,4.9 21.1,4 20,4zM20,8.2l-8,4.8 -8,-4.8V6.2l8,4.8 8,-4.8V8.2z"/></vector>`,
        'aftermeet_widget_ic_plus.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M12,2C6.5,2 2,6.5 2,12s4.5,10 10,10 10,-4.5 10,-10S17.5,2 12,2zM17,13h-4v4h-2v-4H7v-2h4V7h2v4h4V13z"/></vector>`,
        'aftermeet_widget_logo_backing.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#FFFFFF" /><corners android:radius="6dp" /></shape>`,
        'aftermeet_widget_preview_qr.xml': drawablePreviewQr(),
        'aftermeet_widget_preview_logo.xml': drawablePreviewLogo(),
      };
      Object.entries(drawables).forEach(([name, contents]) => {
        fs.writeFileSync(path.join(drawableDir, name), `<?xml version="1.0" encoding="utf-8"?>\n${contents}`);
      });

      const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
      if (fs.existsSync(buildGradlePath)) {
        let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
        if (!buildGradle.includes('com.google.zxing:core')) {
          buildGradle = buildGradle.replace(
            /dependencies\s*\{/,
            "dependencies {\n    implementation 'com.google.zxing:core:3.5.3'",
          );
          fs.writeFileSync(buildGradlePath, buildGradle);
        }
      }

      return mod;
    },
  ]);
}

module.exports = function withAndroidQuickShareWidget(config) {
  return withWidgetModule(withWidgetFiles(withWidgetManifest(config)));
};
