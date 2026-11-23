package jp.bibai.yukikaki.helper.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RectangleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontSynthesis
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import kotlinx.coroutines.delay

// 色・文字・ボタン・枠など、どの画面でも使う部品。見た目は Web(public/liff/snow-ui.css・snow-pixel.css)に合わせる:
// 白い背景・紺の文字・朱色の大事なボタン・四角い枠に影をずらした「ドット絵のカード」・文字は DotGothic16。

object Palette {
    val Navy = Color(0xFF192E49)
    val Vermilion = Color(0xFFB73E2C)
    val White = Color(0xFFFFFFFF)
    val Sky = Color(0xFFD4E0E8)
    val Gold = Color(0xFFFFC94D)
    /** うすい文字(説明・見出しの横の小さな字)。 */
    val Muted = Color(0xFF606C7B)
    /** ボタンの地の色(ほんの少し灰色)。 */
    val Wash = Color(0xFFF3F5F7)
    /** 区切り線・カードの影。 */
    val Rule = Color(0xFFCBD6E0)
    /** テスト用のボタンの灰色の文字。 */
    val TestGray = Color(0xFF8A94A0)
}

/** 角は四角(ドット絵の雰囲気)。 */
val PixelShape = RectangleShape

/** DotGothic16(太字はない。太字のまねもしない)。 */
val DotGothic = FontFamily(Font(R.font.dotgothic16_regular, FontWeight.Normal))

private val BaseTextStyle = TextStyle(
    fontFamily = DotGothic,
    fontWeight = FontWeight.Normal,
    // ドットの形をつぶさないよう、太字・斜体のまねをしない
    fontSynthesis = FontSynthesis.None,
    color = Palette.Navy,
)

private fun dotTypography(): Typography {
    val base = Typography()
    fun TextStyle.dot() = merge(BaseTextStyle)
    return Typography(
        displayLarge = base.displayLarge.dot(),
        displayMedium = base.displayMedium.dot(),
        displaySmall = base.displaySmall.dot(),
        headlineLarge = base.headlineLarge.dot(),
        headlineMedium = base.headlineMedium.dot(),
        headlineSmall = base.headlineSmall.dot(),
        titleLarge = base.titleLarge.dot(),
        titleMedium = base.titleMedium.dot(),
        titleSmall = base.titleSmall.dot(),
        bodyLarge = base.bodyLarge.dot(),
        bodyMedium = base.bodyMedium.dot(),
        bodySmall = base.bodySmall.dot(),
        labelLarge = base.labelLarge.dot(),
        labelMedium = base.labelMedium.dot(),
        labelSmall = base.labelSmall.dot(),
    )
}

@Composable
fun HelperTheme(content: @Composable () -> Unit) {
    val colors = lightColorScheme(
        primary = Palette.Vermilion,
        onPrimary = Palette.White,
        secondary = Palette.Navy,
        onSecondary = Palette.White,
        background = Palette.White,
        onBackground = Palette.Navy,
        surface = Palette.White,
        onSurface = Palette.Navy,
        error = Palette.Vermilion,
    )
    // 端末が暗い表示でも、同じ色で見せる(暗い色の組み合わせは使わない)
    MaterialTheme(colorScheme = colors, typography = remember { dotTypography() }, content = content)
}

/** 上の「ユキカキ・レイド / 美唄」の行(下に紺の線)。 */
@Composable
fun BrandLine() {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PixelIcon(R.drawable.ic_shovel, size = 20)
            Spacer(Modifier.width(12.dp))
            Text("ユキカキ・レイド", fontSize = 17.sp, modifier = Modifier.weight(1f))
            Text("美唄", color = Palette.Muted, fontSize = 15.sp)
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(Palette.Navy))
    }
}

/** 画面の土台(白い背景・上にブランドの行と大きな見出し・縦に並べてスクロール)。 */
@Composable
fun ScreenFrame(
    title: String,
    modifier: Modifier = Modifier,
    isScrollable: Boolean = true,
    bottomBar: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxSize().background(Palette.White)) {
        BrandLine()
        val scroll = if (isScrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().then(scroll).padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, fontSize = 32.sp, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            content()
        }
        bottomBar?.invoke()
    }
}

/** 右下にずらした影(四角)。影のぶんの余白も取る。 */
private fun Modifier.pixelShadow(shadow: Dp, color: Color): Modifier =
    padding(end = shadow, bottom = shadow).drawBehind {
        val offset = shadow.toPx()
        drawRect(color, topLeft = Offset(offset, offset), size = size)
    }

/** ドット絵のカード(白・紺の枠・右下にずらした影)。 */
@Composable
fun PixelCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val clickable = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    Column(
        modifier
            .fillMaxWidth()
            .pixelShadow(4.dp, Palette.Rule)
            .background(Palette.White)
            .border(2.dp, Palette.Navy)
            .then(clickable)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/** ボタン。isPrimary なら朱色(大事なボタン)、そうでなければ うすい灰色。紺の枠と、右下にずらした紺の影。 */
@Composable
fun PixelButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    isEnabled: Boolean = true,
    @DrawableRes icon: Int? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val isPressed by interaction.collectIsPressedAsState()
    val shadow = 3.dp
    // 押している間は、影のほうへ沈む
    val press = if (isPressed && isEnabled) shadow - 1.dp else 0.dp
    val container = if (isPrimary) Palette.Vermilion else Palette.Wash
    val content = if (isPrimary) Palette.White else Palette.Navy
    Box(
        modifier
            .fillMaxWidth()
            .alpha(if (isEnabled) 1f else 0.5f)
            .then(if (isEnabled) Modifier.pixelShadow(shadow, Palette.Navy) else Modifier.padding(end = shadow, bottom = shadow))
            .offset(press, press)
            .heightIn(min = 54.dp)
            .background(container)
            .border(2.dp, Palette.Navy)
            .clickable(interactionSource = interaction, indication = null, enabled = isEnabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                PixelIcon(icon, size = 22)
                Spacer(Modifier.width(10.dp))
            }
            Text(text, color = content, fontSize = 18.sp, textAlign = TextAlign.Center)
        }
    }
}

/** テスト用のボタン(小さく灰色の文字で「テスト: 〇〇」)。画面のいちばん下の TestTools の中に置く。 */
@Composable
fun TestButton(text: String, onClick: () -> Unit, isEnabled: Boolean = true) {
    Text(
        text = text,
        color = Palette.TestGray,
        fontSize = 13.sp,
        textDecoration = TextDecoration.Underline,
        modifier = Modifier
            .alpha(if (isEnabled) 1f else 0.5f)
            .clickable(enabled = isEnabled, onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 6.dp),
    )
}

/** 画面のいちばん下のテスト用のボタンの並び(上に点線)。本当に運用するときは外す。 */
@Composable
fun TestTools(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 20.dp)
            .drawBehind {
                drawLine(
                    color = Color(0xFFC9D0D8),
                    start = Offset(0f, 0f),
                    end = Offset(size.width, 0f),
                    strokeWidth = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)),
                )
            }
            .padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        content()
    }
}

/** ドット絵のアイコン(tint を渡せば、その色で塗る)。 */
@Composable
fun PixelIcon(@DrawableRes icon: Int, size: Int = 20, modifier: Modifier = Modifier, tint: Color? = null) {
    Image(
        painter = painterResource(icon),
        contentDescription = null,
        colorFilter = tint?.let { ColorFilter.tint(it) },
        modifier = modifier.size(size.dp),
    )
}

/** アイコン + 文字の 1 行。 */
@Composable
fun IconLine(@DrawableRes icon: Int, text: String, modifier: Modifier = Modifier, isBold: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        PixelIcon(icon)
        Spacer(Modifier.width(8.dp))
        Text(text, color = Palette.Navy, fontSize = if (isBold) 17.sp else 15.sp)
    }
}

/** 見出し + 値の 1 行(内訳など)。下にうすい線。 */
@Composable
fun LabelValue(label: String, value: String) {
    Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = Palette.Muted)
            Spacer(Modifier.width(12.dp))
            Text(value, color = Palette.Navy, textAlign = TextAlign.End)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.Rule))
    }
}

/** エラーの文字(朱色)。空なら何も出さない。 */
@Composable
fun ErrorText(message: String) {
    if (message.isEmpty()) return
    Text(message, color = Palette.Vermilion)
}

/** 読み込み中。 */
@Composable
fun LoadingBox(text: String = "読み込んでいます…") {
    Box(Modifier.fillMaxSize().background(Palette.White), contentAlignment = Alignment.Center) {
        Text(text, color = Palette.Navy, fontSize = 18.sp)
    }
}

/** 下のタブで選べる画面。 */
enum class Tab { HELP, TEAMS }

/** 下のタブ(助けに行く / チームの記録)。上に紺の線、選んでいるほうは朱色。 */
@Composable
fun BottomTabs(selected: Tab, onHelp: () -> Unit, onTeams: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Palette.White)) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(Palette.Navy))
        Row(Modifier.fillMaxWidth()) {
            TabItem("助けに行く", R.drawable.ic_shovel, selected == Tab.HELP, onHelp, Modifier.weight(1f))
            TabItem("チームの記録", R.drawable.ic_cup, selected == Tab.TEAMS, onTeams, Modifier.weight(1f))
        }
    }
}

@Composable
private fun TabItem(text: String, @DrawableRes icon: Int, isSelected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val color = if (isSelected) Palette.Vermilion else Palette.Muted
    Column(
        modifier.clickable(onClick = onClick).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        PixelIcon(icon, size = 22, tint = color)
        Text(text, color = color, fontSize = 14.sp)
    }
}

/**
 * intervalMs ごとに block をくり返す(画面にいる間だけ)。block が true を返したら止める。
 * 失敗しても止めない(電波が戻ったら続きから)。
 */
@Composable
fun PollEffect(key: Any, intervalMs: Long, block: suspend () -> Boolean) {
    val current = rememberUpdatedState(block)
    LaunchedEffect(key) {
        while (true) {
            delay(intervalMs)
            val shouldStop = runCatching { current.value() }.getOrDefault(false)
            if (shouldStop) break
        }
    }
}
