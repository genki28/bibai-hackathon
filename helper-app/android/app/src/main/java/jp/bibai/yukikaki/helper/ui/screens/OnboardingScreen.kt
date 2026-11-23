package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.IconLine
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.ScreenFrame

/** 名前の長さの上限(サーバーの決まりと同じ 40 文字)。 */
private const val MAX_NAME_LENGTH = 40

/** 1. はじめに: 名前を入れて [はじめる]。 */
@Composable
fun OnboardingScreen(deps: AppDeps, onDone: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf("") }
    ScreenFrame("はじめに") {
        PixelCard {
            IconLine(R.drawable.ic_snowman, "美唄の雪かきを手伝おう", isBold = true)
            Text("お年寄りの家の雪かきを、みんなで手伝うアプリです。", color = Palette.Navy)
        }
        Text("あなたの名前(お年寄りやほかの人に見えます)", color = Palette.Navy, fontSize = 16.sp)
        OutlinedTextField(
            value = name,
            onValueChange = { name = it.take(MAX_NAME_LENGTH) },
            singleLine = true,
            placeholder = { Text("例: ゆきお") },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Palette.White,
                unfocusedContainerColor = Palette.White,
                focusedBorderColor = Palette.Navy,
                unfocusedBorderColor = Palette.Navy,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        ErrorText(error)
        PixelButton("はじめる", isPrimary = true, onClick = {
            if (name.isBlank()) {
                error = "名前を入れてください"
                return@PixelButton
            }
            deps.prefs.displayName = name
            onDone()
        })
    }
}
