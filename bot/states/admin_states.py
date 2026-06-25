from aiogram.fsm.state import State, StatesGroup


class AdminStates(StatesGroup):

    waiting_for_broadcast_message = State()
    confirming_broadcast = State()
    waiting_for_promo_details = State()
    waiting_for_promo_type_selection = State()
    waiting_for_promo_code = State()
    waiting_for_promo_bonus_days = State()
    waiting_for_promo_discount_percentage = State()
    waiting_for_promo_max_activations = State()
    waiting_for_promo_validity_days = State()
    waiting_for_promo_edit_details = State()
    waiting_for_promo_edit_code = State()
    waiting_for_promo_edit_bonus_days = State()
    waiting_for_promo_edit_max_activations = State()
    waiting_for_promo_edit_validity_days = State()
    waiting_for_bulk_promo_quantity = State()
    waiting_for_bulk_promo_bonus_days = State()
    waiting_for_bulk_promo_max_activations = State()
    waiting_for_bulk_promo_validity_days = State()
    waiting_for_user_id_to_ban = State()
    waiting_for_user_id_to_unban = State()

    waiting_for_user_id_for_logs = State()
    
    # User management states
    waiting_for_user_search = State()
    waiting_for_subscription_days_to_add = State()
    waiting_for_direct_message_to_user = State()
    waiting_for_user_delete_confirmation = State()

    # Ads campaigns
    waiting_for_ad_source = State()
    waiting_for_ad_start_param = State()
    waiting_for_ad_cost = State()

    # Tariff management (Phase 7)
    tariff_step_name_ru = State()
    tariff_step_name_en = State()
    tariff_step_desc_ru = State()
    tariff_step_desc_en = State()
    tariff_step_squad = State()
    tariff_step_kind = State()
    tariff_step_billing = State()
    tariff_step_strategy = State()
    tariff_step_is_trial = State()
    tariff_step_opt_duration = State()
    tariff_step_opt_traffic = State()
    tariff_step_opt_gb_input = State()
    tariff_step_opt_price_rub = State()
    tariff_step_opt_price_stars = State()
    tariff_step_opt_more = State()
    tariff_step_confirm = State()
    tariff_step_delete_confirm = State()

    # Trial period management (separate from tariff creation)
    trial_step_squad = State()
    trial_step_days = State()
    trial_step_traffic = State()
    trial_step_gb_input = State()
    trial_step_confirm = State()
