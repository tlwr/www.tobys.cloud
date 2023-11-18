require 'spec_helper'

describe 'assets.tobys.cloud', type: :feature do
  def base_url
    'https://assets.tobys.cloud'
  end

  def favicon_path
    base_url + '/favicon.ico'
  end

  def styles_path
    base_url + '/styles.css'
  end

  it 'has a favicon' do
    page = agent.get(favicon_path)
    expect(page.code.to_i).to eq(200)
    expect(page.body.length).to be >= 1024, 'favicon must be sent'
  end

  it 'has styles' do
    page = agent.get(styles_path)
    expect(page.code.to_i).to eq(200)
    expect(page.body.length).to be >= 256, 'styles must be sent'
    expect(page.body).to match(/@font-face/)
  end
end
