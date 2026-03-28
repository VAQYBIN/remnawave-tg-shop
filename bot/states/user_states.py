from aiogram.fsm.state import State, StatesGroup


class UserPromoStates(StatesGroup):
    waiting_for_promo_code = State()


class LinkEmailStates(StatesGroup):
    waiting_for_email = State()
    waiting_for_code = State()
