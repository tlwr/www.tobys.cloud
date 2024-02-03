require 'spec_helper'

describe 'stats.tobys.cloud', type: :feature do
  def stats_url
    'https://stats.tobys.cloud/'
  end

  it 'has charts on the page' do
    page = agent.get(stats_url)
    expect(page.code.to_i).to eq(200)

    svgs = page.css('svg')
    expect(svgs.count).to be >= 15, 'should render some svgs for each petition'

    petitions = page.css('tr')
    petitions.each do |petition|
      next unless petition.css('th').empty? # skip table heading
      name = petition.css('td').first.text.strip
      path = petition.css('path').first
      expect(path.attr('d').length).to be > 100, "petition #{name} must have long svg path, short path is broken chart"
    end
  end
end
