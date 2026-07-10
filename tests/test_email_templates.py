from web.auth.email_service import (
    PURPOSE_SUBJECT_TEMPLATES,
    PURPOSE_BODY_TEMPLATES,
    _build_html,
)


def test_login_purpose_has_templates():
    assert "login" in PURPOSE_SUBJECT_TEMPLATES
    assert "login" in PURPOSE_BODY_TEMPLATES


def test_login_subject_and_body_render_brand_and_code():
    subject = PURPOSE_SUBJECT_TEMPLATES["login"].format(brand="Raccoonito")
    assert "Raccoonito" in subject
    html = _build_html("login", "391482", "Raccoonito")
    assert "391482" in html
    assert "Ваш код для входа" in html
