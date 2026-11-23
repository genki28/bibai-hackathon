package jp.bibai.yukikaki.helper.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

// 色・ボタン・枠など、どの画面でも使う部品。色は SPEC の 5 色。角は四角め(ドット絵の雰囲気)。

object Palette {
    val Navy = Color(0xFF192E49)
    val Vermilion = Color(0xFFB73E2C)
    val White = Color(0xFFFFFFFF)
    val Sky = Color(0xFFD4E0E8)
    val Gold = Color(0xFFFFC94D)
}

/** ほぼ四角い角(ドット絵の雰囲気)。 */
val PixelShape = RoundedCornerShape(2.dp)

@Composable
fun HelperTheme(content: @Composable () -> Unit) {
    val colors = lightColorScheme(
        primary = Palette.Vermilion,
        onPrimary = Palette.White,
        secondary = Palette.Navy,
        onSecondary = Palette.White,
        background = Palette.Sky,
        onBackground = Palette.Navy,
        surface = Palette.White,
        onSurface = Palette.Navy,
        error = Palette.Vermilion,
    )
    // 端末が暗い表示でも、同じ色で見せる(暗い色の組み合わせは使わない)
    MaterialTheme(colorScheme = colors, content = content)
}

/** 画面の土台(水色の背景・上に題名・縦に並べてスクロール)。 */
@Composable
fun ScreenFrame(
    title: String,
    modifier: Modifier = Modifier,
    isScrollable: Boolean = true,
    bottomBar: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxSize().background(Palette.Sky)) {
        Text(
            text = title,
            color = Palette.White,
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp,
            modifier = Modifier.fillMaxWidth().background(Palette.Navy).padding(horizontal = 16.dp, vertical = 14.dp),
        )
        val scroll = if (isScrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().then(scroll).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
        bottomBar?.invoke()
    }
}

/** 白い枠(紺の線)。 */
@Composable
fun PixelCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val clickable = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    Column(
        modifier
            .fillMaxWidth()
            .border(3.dp, Palette.Navy, PixelShape)
            .background(Palette.White, PixelShape)
            .then(clickable)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

/** ボタン。isPrimary なら朱色(大事なボタン)、そうでなければ白に紺の枠。 */
@Composable
fun PixelButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    isEnabled: Boolean = true,
    @DrawableRes icon: Int? = null,
) {
    val colors = if (isPrimary) {
        ButtonDefaults.buttonColors(containerColor = Palette.Vermilion, contentColor = Palette.White)
    } else {
        ButtonDefaults.buttonColors(containerColor = Palette.White, contentColor = Palette.Navy)
    }
    Button(
        onClick = onClick,
        enabled = isEnabled,
        shape = PixelShape,
        colors = colors,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp).border(3.dp, Palette.Navy, PixelShape),
    ) {
        if (icon != null) {
            PixelIcon(icon, size = 22)
            Spacer(Modifier.width(8.dp))
        }
        Text(text, fontWeight = FontWeight.Bold, fontSize = 17.sp)
    }
}

/** ドット絵のアイコン(色はそのまま)。 */
@Composable
fun PixelIcon(@DrawableRes icon: Int, size: Int = 20, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Image(
        painter = painterResource(icon),
        contentDescription = null,
        modifier = modifier.size(size.dp),
    )
}

/** アイコン + 文字の 1 行。 */
@Composable
fun IconLine(@DrawableRes icon: Int, text: String, modifier: Modifier = Modifier, isBold: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        PixelIcon(icon)
        Spacer(Modifier.width(8.dp))
        Text(text, color = Palette.Navy, fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal)
    }
}

/** 見出し + 値の 1 行(内訳など)。 */
@Composable
fun LabelValue(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Palette.Navy)
        Text(value, color = Palette.Navy, fontWeight = FontWeight.Bold, textAlign = TextAlign.End)
    }
}

/** エラーの文字(朱色)。空なら何も出さない。 */
@Composable
fun ErrorText(message: String) {
    if (message.isEmpty()) return
    Text(message, color = Palette.Vermilion, fontWeight = FontWeight.Bold)
}

/** 読み込み中。 */
@Composable
fun LoadingBox(text: String = "読み込んでいます…") {
    Box(Modifier.fillMaxSize().background(Palette.Sky), contentAlignment = Alignment.Center) {
        Text(text, color = Palette.Navy, fontSize = 18.sp)
    }
}

/** 下のタブ(助けに行く / ランキング)。 */
@Composable
fun BottomTabs(isRanking: Boolean, onHelp: () -> Unit, onRanking: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Palette.Navy)) {
        TabItem("助けに行く", !isRanking, onHelp, Modifier.weight(1f))
        TabItem("ランキング", isRanking, onRanking, Modifier.weight(1f))
    }
}

@Composable
private fun TabItem(text: String, isSelected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Text(
        text = text,
        color = if (isSelected) Palette.Navy else Palette.White,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = modifier
            .background(if (isSelected) Palette.Gold else Palette.Navy)
            .clickable(onClick = onClick)
            .padding(vertical = 16.dp),
    )
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
