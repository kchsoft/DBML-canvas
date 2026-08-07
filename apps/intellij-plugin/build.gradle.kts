plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.2.0"
    id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = "dev.dbmlcanvas"
version = providers.gradleProperty("pluginVersion").get()

val repositoryRoot = rootProject.projectDir.resolve("../..")
val legalResourcesDirectory = layout.buildDirectory.dir("generated-resources/META-INF")

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdea(providers.gradleProperty("platformVersion")) {
            useInstaller = false
        }
        jetbrainsRuntime()
    }
}

kotlin {
    jvmToolchain(21)
}

val copyWebview by tasks.registering(Copy::class) {
    from(rootProject.projectDir.resolve("../host-webview/dist"))
    into(layout.buildDirectory.dir("generated-resources/webview"))
}

val generateThirdPartyNotices by tasks.registering(Exec::class) {
    workingDir(repositoryRoot)
    commandLine(
        "node",
        repositoryRoot.resolve("scripts/generate-third-party-notices.mjs"),
        legalResourcesDirectory.get().file("THIRD_PARTY_NOTICES.txt").asFile.absolutePath,
    )
    inputs.file(repositoryRoot.resolve("package-lock.json"))
    inputs.file(repositoryRoot.resolve("scripts/generate-third-party-notices.mjs"))
    inputs.dir(repositoryRoot.resolve("legal/third-party"))
    outputs.file(legalResourcesDirectory.map { it.file("THIRD_PARTY_NOTICES.txt") })
}

tasks.processResources {
    dependsOn(copyWebview, generateThirdPartyNotices)
    from(layout.buildDirectory.dir("generated-resources"))
    from(repositoryRoot.resolve("EULA.md")) {
        into("META-INF")
        rename("EULA.md", "EULA.txt")
    }
}

intellijPlatform {
    pluginConfiguration {
        name = "DBML Canvas"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "253"
        }
    }
}
