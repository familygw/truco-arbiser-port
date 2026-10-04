// @category Truco
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.CodeUnit;

/** Labels verified by native Flor fixtures and complete Truco hand traces. */
public class RecoverFlorTrucoLabels extends GhidraScript {
    public void run() throws Exception {
        String[][] globals = {
            {"1d76", "cpu_flor_points"}, {"1d88", "truco_bid_state"},
            {"1d6e", "processed_card_count"}, {"18bc", "player_played_card_count"},
            {"1dde", "cpu_declared_flor"}, {"1de0", "player_flor_claim_mode"},
            {"1dee", "cpu_weakest_remaining_slot"}, {"1df6", "cpu_middle_remaining_slot"},
            {"1df0", "cpu_strongest_remaining_slot"}
        };
        for (String[] entry : globals) {
            Address at = currentProgram.getAddressFactory().getAddress("1de2:" + entry[0]);
            createLabel(at, entry[1], true);
        }
        String[][] blocks = {
            {"292a", "cpu_response_to_player_flor", "CPU without Flor concedes 3. With Flor: reject 4, Con Flor Quiero accepts 6; code 7 is al resto."},
            {"2aa6", "flor_declaration_bounds", "Declare 20..38 if player mano; CPU mano permits son buenas=0 and wins ties."},
            {"5aa5", "cpu_flor_opening", "Only reached with real CPU Flor. Draw 1..10: opening wager 3, weak me-achico 4, or al-resto 30."},
            {"5b6b", "player_reply_to_cpu_flor", "Original replies vary with wager 3/4/30. Con Flor Quiero is code 6; generic Quiero is 24."},
            {"7c73", "false_flor_penalty", "Add four CPU points, transfer player's pending wager at 7D2B."},
            {"7e32", "audit_flor_numeric_claim", "Sum three pips +20. Wrong numeric claim transfers wager; no extra four."},
            {"2d06", "cpu_pie_first_card_strategy", "Persistent Truco/card decision graph; uses declared tanto and opponent's played card."},
            {"3af4", "cpu_call_truco", "Set bid state 2; voice group 7 (records 85..96)."},
            {"3b03", "cpu_call_retruco", "Set bid state 6; voice group 8 (records 97..108)."},
            {"5cd7", "cpu_mano_card_strategy", "First card and subsequent phases share persistent inference and raise flags."},
            {"60f5", "cpu_mano_truco_response", "Native response to player Truco; tested with exact branch/RNG tapes."},
            {"633a", "cpu_mano_retruco_response", "Native response to player Retruco; may compute floor((weak+strong)/2)."},
            {"9b67", "cpu_call_vale_four", "Set bid state 10; voice group 9 (records 109..120)."}
        };
        for (String[] entry : blocks) {
            Address at = currentProgram.getAddressFactory().getAddress("1000:" + entry[0]);
            createLabel(at, entry[1], true);
            currentProgram.getListing().setComment(at, CodeUnit.PRE_COMMENT, entry[2]);
        }
        println("Verified Flor and persistent Truco labels installed.");
    }
}
