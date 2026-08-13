const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const { writeWidgetPreviewPngs } = require('./widget-preview-pngs');

const PACKAGE_SUFFIX = 'widget';
const PREFS_NAME = 'aftermeet_widget';
const PREFS = {
  cardsJson: 'cardsJson',
  logoImageBase64: 'logoImageBase64',
  connectionsDeepLink: 'connectionsDeepLink',
  recentConnectionsJson: 'recentConnectionsJson',
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

function kotlinBridge(packageName) {
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
        .putString("${PREFS.connectionsDeepLink}", payload.getString("connectionsDeepLink") ?: "ehllo://connections")
        .putString("${PREFS.recentConnectionsJson}", payload.getString("recentConnectionsJson") ?: "[]")

      for (slot in 1..3) {
        editor.putString("connection\${slot}Name", payload.getString("connection\${slot}Name") ?: "")
        editor.putString("connection\${slot}Subtitle", payload.getString("connection\${slot}Subtitle") ?: "")
        editor.putString("connection\${slot}Phone", payload.getString("connection\${slot}Phone") ?: "")
        editor.putString("connection\${slot}Email", payload.getString("connection\${slot}Email") ?: "")
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

function kotlinRenderer(packageName) {
  return `package ${packageName}.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
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
  private const val DEMO_DEEP_LINK = "ehllo://share-card"

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
      if (parsed.length() == 0) placeholderCards() else parsed
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

  private fun messageIntent(context: Context, widgetId: Int, email: String, phone: String, requestCode: Int): PendingIntent? {
    val uri = when {
      phone.isNotBlank() -> Uri.parse("sms:\$phone")
      email.isNotBlank() -> Uri.parse("mailto:\$email")
      else -> return null
    }
    val intent = Intent(Intent.ACTION_VIEW, uri)
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
    qrBitmap(card, store, size)?.let { views.setImageViewBitmap(R.id.aftermeet_qr_scan_image, it) }
    applyLogo(views, R.id.aftermeet_qr_scan_logo, store)
    views.setOnClickPendingIntent(R.id.aftermeet_qr_scan_root, openAppIntent(context, id, deepLink))
    manager.updateAppWidget(id, views)
  }

  private fun renderBusinessCard(context: Context, manager: AppWidgetManager, id: Int) {
    val store = prefs(context)
    val cards = loadCards(context)
    val index = cardIndex(context, id, cards.length())
    val card = cards.optJSONObject(index) ?: JSONObject()
    val name = card.optString("name", "Alex Morgan")
    val role = card.optString("role", "Product Designer")
    val company = card.optString("company", "ehllo")
    val deepLink = card.optString("shareDeepLink", DEMO_DEEP_LINK)
    val initials = card.optString("initials", "AM")
    val views = RemoteViews(context.packageName, R.layout.aftermeet_widget_business_card)

    views.setTextViewText(R.id.aftermeet_card_initials, initials)
    views.setTextViewText(R.id.aftermeet_card_name, name)
    views.setTextViewText(R.id.aftermeet_card_role, role)
    views.setTextViewText(R.id.aftermeet_card_company, company)
    qrBitmap(card, store, dpToPx(context, 64))?.let { views.setImageViewBitmap(R.id.aftermeet_card_qr, it) }
    applyLogo(views, R.id.aftermeet_card_qr_logo, store)

    decodeBitmap(card.optString("photoImageBase64", ""))?.let {
      views.setViewVisibility(R.id.aftermeet_card_initials, View.GONE)
      views.setViewVisibility(R.id.aftermeet_card_photo, View.VISIBLE)
      views.setImageViewBitmap(R.id.aftermeet_card_photo, it)
    } ?: run {
      views.setViewVisibility(R.id.aftermeet_card_initials, View.VISIBLE)
      views.setViewVisibility(R.id.aftermeet_card_photo, View.GONE)
    }

    if (cards.length() > 1) {
      views.setViewVisibility(R.id.aftermeet_card_pager, View.VISIBLE)
      views.setTextViewText(R.id.aftermeet_card_pager_label, "CARD \${(index + 1).toString().padStart(2, '0')}")
      views.setOnClickPendingIntent(
        R.id.aftermeet_card_prev,
        cardActionIntent(context, id, "${packageName}.widget.ACTION_CARD_PREV", 3000),
      )
      views.setOnClickPendingIntent(
        R.id.aftermeet_card_next,
        cardActionIntent(context, id, "${packageName}.widget.ACTION_CARD_NEXT", 4000),
      )
    } else {
      views.setViewVisibility(R.id.aftermeet_card_pager, View.GONE)
    }

    views.setOnClickPendingIntent(R.id.aftermeet_card_body, openAppIntent(context, id, deepLink, 5000))
    manager.updateAppWidget(id, views)
  }

  private fun renderConnections(context: Context, manager: AppWidgetManager, id: Int) {
    val store = prefs(context)
    val deepLink = store.getString("${PREFS.connectionsDeepLink}", "ehllo://connections") ?: "ehllo://connections"
    val connections = loadConnections(context)
    val views = RemoteViews(context.packageName, R.layout.aftermeet_widget_connections)
    var visibleRows = 0

    for (slot in 1..3) {
      val connection = connections.optJSONObject(slot - 1)
      val rowId = when (slot) {
        1 -> R.id.aftermeet_connection_row_1
        2 -> R.id.aftermeet_connection_row_2
        else -> R.id.aftermeet_connection_row_3
      }
      val nameId = when (slot) {
        1 -> R.id.aftermeet_connection_name_1
        2 -> R.id.aftermeet_connection_name_2
        else -> R.id.aftermeet_connection_name_3
      }
      val subtitleId = when (slot) {
        1 -> R.id.aftermeet_connection_subtitle_1
        2 -> R.id.aftermeet_connection_subtitle_2
        else -> R.id.aftermeet_connection_subtitle_3
      }
      val avatarId = when (slot) {
        1 -> R.id.aftermeet_connection_avatar_1
        2 -> R.id.aftermeet_connection_avatar_2
        else -> R.id.aftermeet_connection_avatar_3
      }
      val phoneId = when (slot) {
        1 -> R.id.aftermeet_connection_phone_1
        2 -> R.id.aftermeet_connection_phone_2
        else -> R.id.aftermeet_connection_phone_3
      }
      val messageId = when (slot) {
        1 -> R.id.aftermeet_connection_message_1
        2 -> R.id.aftermeet_connection_message_2
        else -> R.id.aftermeet_connection_message_3
      }

      if (connection == null) {
        views.setViewVisibility(rowId, View.GONE)
        continue
      }

      val name = connection.optString("name", "")
      val subtitle = connection.optString("subtitle", "Shared via your card")
      val phone = connection.optString("phone", "")
      val email = connection.optString("email", "")

      visibleRows += 1
      views.setViewVisibility(rowId, View.VISIBLE)
      views.setTextViewText(nameId, name)
      views.setTextViewText(subtitleId, subtitle)
      views.setTextViewText(avatarId, name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?")
      dialIntent(context, id, phone, slot * 10)?.let { views.setOnClickPendingIntent(phoneId, it) }
      messageIntent(context, id, email, phone, slot * 10 + 100)?.let { views.setOnClickPendingIntent(messageId, it) }
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
    android:layout_height="match_parent"
    android:background="@drawable/aftermeet_widget_accent_frame_compact"
    android:padding="4dp">
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
  android:background="@drawable/aftermeet_widget_dark_background_wide"
  android:paddingLeft="10dp"
  android:paddingTop="8dp"
  android:paddingRight="10dp"
  android:paddingBottom="8dp">
  <LinearLayout
    android:id="@+id/aftermeet_card_body"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center_vertical"
    android:orientation="horizontal">
    <FrameLayout
      android:layout_width="72dp"
      android:layout_height="72dp"
      android:background="@drawable/aftermeet_widget_qr_dark_panel">
      <ImageView
        android:id="@+id/aftermeet_card_qr"
        android:layout_width="64dp"
        android:layout_height="64dp"
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
        android:padding="1dp"
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
        android:layout_width="26dp"
        android:layout_height="26dp"
        android:background="@drawable/aftermeet_widget_avatar_ring"
        android:gravity="center"
        android:text="AM"
        android:textColor="#9FE870"
        android:textSize="10sp"
        android:textStyle="bold" />
      <ImageView
        android:id="@+id/aftermeet_card_photo"
        android:layout_width="26dp"
        android:layout_height="26dp"
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
        android:textSize="13sp"
        android:textStyle="bold" />
      <TextView
        android:id="@+id/aftermeet_card_role"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="Product Designer"
        android:textColor="#B8C4B3"
        android:textSize="10sp" />
      <TextView
        android:id="@+id/aftermeet_card_company"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="ehllo"
        android:textColor="#8FA088"
        android:textSize="9sp" />
      <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:gravity="center_vertical"
        android:orientation="horizontal">
        <TextView
          android:layout_width="0dp"
          android:layout_height="wrap_content"
          android:layout_weight="1"
          android:text="ehllo"
          android:textColor="#9FE870"
          android:textSize="8sp"
          android:textStyle="bold" />
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
            android:textColor="#8FA088"
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
  const rows = [1, 2, 3].map((slot) => {
    const sampleNames = ['Jordan Lee', 'Cameron Williamson', 'Savannah Nguyen'];
    const sampleName = preview ? sampleNames[slot - 1] : '';
    const sampleInitial = preview ? sampleName.charAt(0) : 'A';
    return `
    <LinearLayout
      android:id="@+id/aftermeet_connection_row_${slot}"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="${slot === 1 ? '0' : '6'}dp"
      android:gravity="center_vertical"
      android:orientation="horizontal"
      android:visibility="${preview ? 'visible' : 'gone'}">
      <TextView
        android:id="@+id/aftermeet_connection_avatar_${slot}"
        android:layout_width="24dp"
        android:layout_height="24dp"
        android:background="@drawable/aftermeet_widget_avatar_ring"
        android:gravity="center"
        android:text="${sampleInitial}"
        android:textColor="#FFFFFF"
        android:textSize="10sp"
        android:textStyle="bold" />
      <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="8dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
          android:id="@+id/aftermeet_connection_name_${slot}"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:text="${preview ? sampleName : ''}"
          android:textColor="#FFFFFF"
          android:textSize="12sp"
          android:textStyle="bold" />
        <TextView
          android:id="@+id/aftermeet_connection_subtitle_${slot}"
          android:layout_width="wrap_content"
          android:layout_height="wrap_content"
          android:text="Shared via your card"
          android:textColor="#8FA088"
          android:textSize="10sp" />
      </LinearLayout>
      <TextView
        android:id="@+id/aftermeet_connection_phone_${slot}"
        android:layout_width="28dp"
        android:layout_height="28dp"
        android:background="@drawable/aftermeet_widget_action_chip"
        android:gravity="center"
        android:text="☎"
        android:textColor="#FFFFFF"
        android:textSize="12sp" />
      <TextView
        android:id="@+id/aftermeet_connection_message_${slot}"
        android:layout_width="28dp"
        android:layout_height="28dp"
        android:layout_marginStart="6dp"
        android:background="@drawable/aftermeet_widget_action_chip"
        android:gravity="center"
        android:text="✉"
        android:textColor="#FFFFFF"
        android:textSize="12sp" />
    </LinearLayout>`;
  }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/aftermeet_connections_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/aftermeet_widget_dark_background_wide"
  android:orientation="vertical"
  android:paddingHorizontal="10dp"
  android:paddingVertical="8dp">
  <TextView
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="RECENT CONNECTIONS"
    android:textColor="#9FE870"
    android:textSize="9sp"
    android:textStyle="bold" />
  <TextView
    android:id="@+id/aftermeet_connections_empty"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="10dp"
    android:text="Share your card to see new connections here."
    android:textColor="#B8C4B3"
    android:textSize="11sp"
    android:visibility="gone" />
  <LinearLayout
    android:id="@+id/aftermeet_connections_list"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:orientation="vertical">${rows}
  </LinearLayout>
</LinearLayout>`;
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

      writeWidgetPreviewPngs(drawableNodpiDir);

      fs.writeFileSync(path.join(kotlinDir, 'QuickShareWidgetBridge.kt'), kotlinBridge(packageName));
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
      fs.writeFileSync(path.join(kotlinDir, 'WidgetRenderer.kt'), kotlinRenderer(packageName));

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
        'aftermeet_widget_dark_background_compact.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#141814" /><corners android:radius="16dp" /></shape>`,
        'aftermeet_widget_dark_background_wide.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#141814" /><corners android:radius="20dp" /></shape>`,
        'aftermeet_widget_accent_frame_compact.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#FFFFFF" /><stroke android:width="3dp" android:color="#9FE870" /><corners android:radius="14dp" /></shape>`,
        'aftermeet_widget_qr_dark_panel.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#000000" /><corners android:radius="12dp" /></shape>`,
        'aftermeet_widget_avatar_ring.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval"><solid android:color="#243024" /><stroke android:width="1dp" android:color="#9FE870" /></shape>`,
        'aftermeet_widget_action_chip.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval"><solid android:color="#243024" /></shape>`,
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
