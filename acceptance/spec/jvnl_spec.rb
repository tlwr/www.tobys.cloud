require 'securerandom'

require_relative 'spec_helper'

describe 'jvnl', type: :feature do
  def base_url
    'https://jasmijnvink.com'
  end

  def homepage_path
    base_url + '/'
  end

  def pictures_page_path
    base_url + '/pictures'
  end

  before(:example) do
    agent.user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
  end

  it 'has a browseable homepage' do
    page = agent.get(homepage_path)
    expect(page.code.to_i).to eq(200)
  end

  it 'has a pictures page' do
    homepage = agent.get(homepage_path)
    expect(homepage.code.to_i).to eq(200)

    pictures_page = homepage.link_with(text: 'alle beelden').click
    expect(pictures_page.uri.to_s).to eq(pictures_page_path), 'clicking pictures link takes you to pictures page'

    pictures_links = pictures_page.links.map { |l| l.uri.to_s }.select { _1 =~ /^\/pictures/ }
    expect(pictures_links.count).to be >= 3, "pictures links #{pictures_links} should be >=3"

    pictures_page.links.each do |link|
      next unless link.uri.to_s =~ /^\/pictures\/./
      post_page = link.click
      expect(post_page.code.to_i).to eq(200)
    end
  end
end
