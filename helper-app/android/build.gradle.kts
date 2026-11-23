// 版の組み合わせ: Gradle 8.14.3 + AGP 8.13.2(Gradle 8.13 以上・Java 17 が必要)+ Kotlin 2.2.21。
// AGP 9 は Gradle 9 が必要なので使わない。
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.2.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.21" apply false
}
