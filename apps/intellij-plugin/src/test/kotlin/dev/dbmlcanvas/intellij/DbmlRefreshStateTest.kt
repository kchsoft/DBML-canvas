package dev.dbmlcanvas.intellij

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DbmlRefreshStateTest {
    @Test
    fun `external changes match only the selected DBML URL`() {
        val state = DbmlRefreshState()

        state.beginRefresh("file:///project/schema.dbml")

        assertTrue(state.matchesCurrentFile("file:///project/schema.dbml"))
        assertFalse(state.matchesCurrentFile("memory:///project/schema.dbml"))
    }

    @Test
    fun `selecting another DBML invalidates an in-flight refresh`() {
        val state = DbmlRefreshState()
        val firstRefresh = state.beginRefresh("file:///project/first.dbml")

        val secondRefresh = state.beginRefresh("file:///project/second.dbml")

        assertFalse(state.isCurrent(firstRefresh))
        assertTrue(state.isCurrent(secondRefresh))
    }

    @Test
    fun `a newer refresh of the same DBML invalidates the older result`() {
        val state = DbmlRefreshState()
        val olderRefresh = state.beginRefresh("file:///project/schema.dbml")

        val newerRefresh = state.beginRefresh("file:///project/schema.dbml")

        assertFalse(state.isCurrent(olderRefresh))
        assertTrue(state.isCurrent(newerRefresh))
    }

    @Test
    fun `an invalidated refresh cannot deliver its result later`() {
        val state = DbmlRefreshState()
        val olderRefresh = state.beginRefresh("file:///project/schema.dbml")
        val currentRefresh = state.beginRefresh("file:///project/other.dbml")
        var olderDelivered = false
        var currentDelivered = false

        state.runIfCurrent(olderRefresh) {
            olderDelivered = true
        }
        state.runIfCurrent(currentRefresh) {
            currentDelivered = true
        }

        assertFalse(olderDelivered)
        assertTrue(currentDelivered)
    }
}
