plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/** サーバーの URL。既定は公開中のサーバー。手元で試すときは -PapiBase=http://10.0.2.2:3000 を付ける。 */
val apiBase: String = (project.findProperty("apiBase") as String?)
    ?: "https://bibai-yukikaki.gba-to-web-slide.workers.dev"

android {
    namespace = "jp.bibai.yukikaki.helper"
    compileSdk = 36

    defaultConfig {
        applicationId = "jp.bibai.yukikaki.helper"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE", "\"$apiBase\"")
    }

    buildTypes {
        debug {
            // http(暗号化なし)を許すのはデバッグのときだけ(手元のサーバー http://10.0.2.2:3000 で試すため)
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            isMinifyEnabled = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    // 鍵の要らない地図(OpenStreetMap)
    implementation("org.osmdroid:osmdroid-android:6.1.20")

    testImplementation("junit:junit:4.13.2")
    // 単体テストでは Android の org.json が使えないので、同じものを入れる
    testImplementation("org.json:json:20250517")
}
