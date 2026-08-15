package dev.dbmlcanvas.intellij

internal class DbmlRefreshState {
    internal data class Ticket(
        val fileUrl: String,
        val generation: Long,
    )

    private var currentFileUrl: String? = null
    private var generation = 0L

    @Synchronized
    fun beginRefresh(fileUrl: String): Ticket {
        currentFileUrl = fileUrl
        generation += 1
        return Ticket(fileUrl, generation)
    }

    @Synchronized
    fun matchesCurrentFile(fileUrl: String): Boolean = currentFileUrl == fileUrl

    @Synchronized
    fun isCurrent(ticket: Ticket): Boolean =
        currentFileUrl == ticket.fileUrl && generation == ticket.generation

    @Synchronized
    fun runIfCurrent(ticket: Ticket, action: () -> Unit) {
        if (!isCurrent(ticket)) return
        action()
    }
}
