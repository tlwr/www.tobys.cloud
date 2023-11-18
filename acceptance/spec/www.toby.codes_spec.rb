require 'spec_helper'

def base_url
  'https://www.toby.codes'
end

def homepage_path
  base_url + '/'
end

def posts_page_path
  base_url + '/posts'
end

describe 'www.toby.codes', type: :feature do
  it 'has a browseable homepage' do
    page = agent.get(homepage_path)
    expect(page.code.to_i).to eq(200)
  end

  it 'has an about page' do
    homepage = agent.get(homepage_path)
    expect(homepage.code.to_i).to eq(200)

    homepage = homepage.link_with(text: 'About').click
    expect(homepage.uri.to_s).to eq(homepage_path), 'clicking about link takes you to homepage'
  end

  it 'has a posts page' do
    homepage = agent.get(homepage_path)
    expect(homepage.code.to_i).to eq(200)

    posts_page = homepage.link_with(text: 'Posts').click
    expect(posts_page.uri.to_s).to eq(posts_page_path), 'clicking posts link takes you to posts page'

    posts_links = posts_page.links.map { |l| l.uri.to_s }.select { _1 =~ /^\/posts/ }
    expect(posts_links.count).to be >= 10, "post links #{posts_links} should be >=10"

    posts_page.links.each do |link|
      next unless link.uri.to_s =~ /^\/posts\/./
      post_page = link.click
      expect(post_page.code.to_i).to eq(200)
    end
  end
end
