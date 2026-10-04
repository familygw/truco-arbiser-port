// @category Truco
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.listing.CodeUnit;

/** Verified names from Envido declaration/award paths; no speculative function bodies. */
public class RecoverEnvidoLabels extends GhidraScript {
    public void run() throws Exception {
        String[][] globals = {
            {"1d48", "player_total_score"}, {"1d4a", "cpu_total_score"},
            {"1d50", "player_falta_count"}, {"1d6a", "cpu_is_mano"},
            {"1d74", "cpu_envido_points"}, {"1d78", "opening_started"},
            {"1d7a", "envido_strategy_roll"}, {"1d82", "hand_number"},
            {"1d86", "cpu_pending_points"}, {"1d8e", "pending_envido_wager"},
            {"1d94", "cpu_actual_tanto"}, {"1d96", "player_claimed_tanto"},
            {"1d9c", "player_pending_points"}, {"1d9e", "tanto_audit_penalized"},
            {"1db0", "previous_envido_wager"}, {"1dba", "player_ahead_with_pending"},
            {"1dce", "envido_strategy_roll_ready"}
        };
        // Delete only earlier score labels, whose ownership was reversed.
        for (String offset : new String[]{"1d48", "1d4a"}) {
            Address at = currentProgram.getAddressFactory().getAddress("1de2:" + offset);
            for (Symbol symbol : currentProgram.getSymbolTable().getSymbols(at)) {
                if (symbol.getName().equals("player_total_score") || symbol.getName().equals("cpu_total_score")) symbol.delete();
            }
        }
        for (String[] entry : globals) {
            Address at = currentProgram.getAddressFactory().getAddress("1de2:" + entry[0]);
            createLabel(at, entry[1], true);
        }
        String[][] blocks = {
            {"1a6a", "envido_declare_by_mano", "CPU declares actual 1D74/1D94. Mano declares first; CPU mano wins ties."},
            {"1db2", "envido_rejection_cap", "Equal capped accept/reject stakes force Quiero Obligada at 1A54."},
            {"22d4", "cpu_pie_envido_opening", "Draw persistent 1D7A; set opening_started at 22F2."},
            {"24ad", "cpu_opened_envido_counter", "Separate response policy when CPU initiated the exchange."},
            {"57e7", "cpu_mano_envido_opening", "CPU opening policy; Flor has already been handled at 57C9."},
            {"5a90", "cpu_mano_tanto_compare", "Losing/tied player claims normalize to zero (son buenas)."},
            {"7b86", "audit_player_tanto", "Invalid Envido transfers player pending wager to CPU. Hidden Flor additionally adds 4."}
        };
        for (String[] entry : blocks) {
            Address at = currentProgram.getAddressFactory().getAddress("1000:" + entry[0]);
            createLabel(at, entry[1], true);
            currentProgram.getListing().setComment(at, CodeUnit.PRE_COMMENT, entry[2]);
        }
        println("Verified Envido labels installed; player DS:1D48, CPU DS:1D4A.");
    }
}
